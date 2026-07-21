import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q5_WALLPUNCH } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import { Button, textChip } from '../../ui/Button';
import { Cadet, speechBubble } from '../../ui/Characters';
import { addSceneBg, addVignette } from '../../ui/Scenery';
import { HAPTIC, vibrate } from '../../utils/haptics';
import { chance, pick, randFloat } from '../../utils/rng';
import { BaseMainScene } from './BaseMainScene';

/**
 * 배경(bg_wallpunch_*)에서 옆방과 맞닿은 벽이 있는 화면 왼쪽 —
 * 말풍선과 충격 연출이 새어나오는 지점.
 */
const WALL_X = 150;

/** 판정 링 위치 — 노트가 여기 닿는 순간이 '쿵' 타이밍 */
const RING_X = WALL_X + 60;
const LANE_Y = 600;
/** 노트가 태어나는 화면 오른쪽 바깥 */
const SPAWN_X = GAME_WIDTH + 70;
/** 카운트인 박자 수 — '3, 2, 1, 시작!' 뒤 첫 노트가 온다 */
const COUNT_BEATS = 4;

/** 벽 너머 1학년들의 수다 (선택 단계 — 칠지 말지 고민하는 동안) */
const CHATTER_LINES = [
  'ㅋㅋㅋㅋㅋ',
  '아 진짜라니까?',
  '미쳤나봐 ㅋㅋ',
  '야 조용히 해봐 ㅋㅋ',
  '한 판만 더 하자',
  '아 배고파...',
  'ㄹㅇㅋㅋ',
];

type PunchPhase = 'choose' | 'play' | 'done';

interface RhythmNote {
  /** 판정 링 도달 시각 (songTime 기준 ms) */
  t: number;
  obj: Phaser.GameObjects.Container | null;
  resolved: boolean;
}

/**
 * Q5. 옆방(1학년 방) 벽 치기 — 타이코풍 리듬게임.
 * 옆방이 시끄럽다. 박자에 맞춰 벽을 쳐서 조용히 시켜라.
 * - 👊 노트가 오른쪽에서 흘러와 벽의 판정 링에 닿는 순간 화면을 탭.
 * - 박자가 어긋난 쿵 소리(미스·헛타)가 3번 쌓이면 소음이 복도까지 울려
 *   순찰 선배에게 발각 — 즉사.
 * - 노미스로 끝내면 옆방을 완전히 제압 — ❤️ 목숨 +1칸.
 * - 참고 자면 안전하지만 보상도 없다.
 */
export class WallPunchScene extends BaseMainScene {
  private phase: PunchPhase = 'choose';
  private chatterEvent: Phaser.Time.TimerEvent | null = null;

  private punchBtn!: Button;
  private sleepBtn!: Button;
  private dim!: Phaser.GameObjects.Rectangle;
  private suspenseText!: Phaser.GameObjects.Text;
  /** 벽 치는 컷 — 누운 컷 위에 겹쳐 두고 알파만 켜서 타격 순간을 만든다 */
  private sceneHit!: Phaser.GameObjects.Image;

  // ── 리듬 상태 ──
  /** 씬 pause에 흔들리지 않도록 delta 누적으로 굴리는 곡 시계 (ms) */
  private songTime = 0;
  private lastBeat = -1;
  private beatMs = 640;
  private goodMs = 200;
  private notes: RhythmNote[] = [];
  private missCount = 0;
  private combo = 0;
  private endScheduled = false;
  /** 마지막으로 처리(히트/미스)된 노트의 t — 그쪽을 향한 늦은 탭은 벌점 없이 무시 */
  private lastResolvedT: number | null = null;
  /** '아직!' 안내 팝업 스로틀 (songTime 기준) */
  private earlyPopupAt = -1000;

  private subText!: Phaser.GameObjects.Text;
  private missText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private ring!: Phaser.GameObjects.Container;
  private laneG!: Phaser.GameObjects.Graphics;
  private tapLabel!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'wallpunch' });
  }

  /** 옆방 수다와 벽 치는 쿵 소리가 이 판의 음악이다 — BGM은 끈다 */
  protected bgmTrack(): null {
    return null;
  }

  /** 밀리초 판정이 도는 리듬게임 — 미니 퀘스트 난입은 억울한 미스만 만든다 */
  protected allowsMini(): boolean {
    return false;
  }

  create(): void {
    this.phase = 'choose';
    this.chatterEvent = null;
    this.songTime = 0;
    this.lastBeat = -1;
    this.notes = [];
    this.missCount = 0;
    this.combo = 0;
    this.endScheduled = false;
    this.lastResolvedT = null;
    this.earlyPopupAt = -1000;

    // 실제 호실 사진을 그대로 옮긴 야간 씬 — 인물이 그 방의 그 침대에 누워 있다.
    // (별도의 벽 오브젝트를 그리지 않는다 — 벽은 사진 속 진짜 왼쪽 벽이다)
    addSceneBg(this, 'bg_wallpunch_idle');
    this.sceneHit = addSceneBg(this, 'bg_wallpunch_hit', -999).setAlpha(0);
    addVignette(this, 0.35);

    textChip(this, GAME_WIDTH / 2 + 60, 120, '옆방이 너무 시끄럽다...', { fontSize: 38, depth: 10 });
    this.subText = this.add
      .text(GAME_WIDTH / 2 + 60, 200, '박자에 맞춰 벽을 쳐라 — 미스 3번이면 발각당한다!', {
        fontFamily: FONT,
        fontSize: '24px',
        color: COLORS.inkCss,
        stroke: '#ffffff',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(11);

    // 미스 슬롯 — 3칸이 다 차는 순간 발각 (시선이 머무는 레인 바로 아래)
    this.missText = this.add
      .text(GAME_WIDTH / 2 + 60, 700, '', {
        fontFamily: FONT,
        fontSize: '34px',
        color: COLORS.textCss,
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(11)
      .setVisible(false);

    // 카운트인 "3, 2, 1, 시작!"
    this.countText = this.add
      .text(GAME_WIDTH / 2 + 60, 430, '', {
        fontFamily: FONT,
        fontSize: '88px',
        color: COLORS.warnCss,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(45);

    this.createLane();

    this.comboText = this.add
      .text(RING_X, LANE_Y + 150, '', {
        fontFamily: FONT,
        fontSize: '36px',
        color: COLORS.safeCss,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(41);

    this.dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setOrigin(0)
      .setDepth(50);

    this.suspenseText = this.add
      .text(WALL_X + 180, 460, '', {
        fontFamily: FONT,
        fontSize: '52px',
        color: COLORS.textCss,
      })
      .setOrigin(0.5)
      .setDepth(60);

    this.punchBtn = new Button(this, GAME_WIDTH / 2 + 60, GAME_HEIGHT - 280, {
      label: '👊 박자 도전 (노미스=❤️+1)',
      width: 520,
      height: 124,
      color: COLORS.accent,
      fontSize: 30,
      onClick: () => this.startChallenge(),
    });
    this.sleepBtn = new Button(this, GAME_WIDTH / 2 + 60, GAME_HEIGHT - 140, {
      label: '😪 참고 잔다 (안전)',
      width: 420,
      height: 104,
      color: COLORS.panelLight,
      fontSize: 32,
      onClick: () => this.sleep(),
    });

    // 리듬 입력 — 노트가 링에 닿는 순간 화면 아무 데나 탭
    this.input.on('pointerdown', this.onTap, this);

    this.setupCommon();
    this.startNoisy();
  }

  /** 판정 링 + 노트가 흐르는 레인 가이드 */
  private createLane(): void {
    const g = this.add.graphics().setDepth(30);
    g.lineStyle(4, 0xffffff, 0.35);
    g.lineBetween(RING_X, LANE_Y, GAME_WIDTH, LANE_Y);

    this.ring = this.add.container(RING_X, LANE_Y).setDepth(31);
    const outer = this.add.circle(0, 0, 56, 0x000000, 0).setStrokeStyle(7, COLORS.warn, 1);
    const inner = this.add.circle(0, 0, 44, 0xffffff, 0.14).setStrokeStyle(3, 0x000000, 0.8);
    this.ring.add([outer, inner]);

    this.tapLabel = this.add
      .text(RING_X, LANE_Y + 62, '👊가 닿는 순간!', {
        fontFamily: FONT,
        fontSize: '22px',
        color: COLORS.warnCss,
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 0)
      .setDepth(31);

    // 레인은 도전을 시작해야 보인다
    this.ring.setVisible(false);
    this.tapLabel.setVisible(false);
    g.setVisible(false);
    this.laneG = g;
  }

  // ── 옆방 수다 (선택 단계) ─────────────────────

  private startNoisy(): void {
    if (this.finished) return;
    this.punchBtn.setEnabled(true);
    this.sleepBtn.setEnabled(true);
    audio.startChatter();
    this.spawnChatterBubble();
    this.chatterEvent = this.time.addEvent({
      delay: 1100,
      loop: true,
      callback: () => {
        if (!this.finished && this.phase === 'choose') {
          audio.startChatter(); // 오디오 언락이 늦어도 self-heal
          this.spawnChatterBubble();
        }
      },
    });
  }

  private stopChatterBubbles(): void {
    this.chatterEvent?.remove();
    this.chatterEvent = null;
  }

  private spawnChatterBubble(): void {
    audio.chatterBlip(); // 말풍선에 맞춰 웅얼거리는 말소리
    speechBubble(
      this,
      WALL_X + randFloat(-40, 70),
      randFloat(360, 700),
      pick(CHATTER_LINES),
      1000,
      40
    );
  }

  // ── 선택: 참고 잔다 (안전) ────────────────────

  private sleep(): void {
    if (this.finished || this.phase !== 'choose') return;
    this.phase = 'done';
    this.punchBtn.setEnabled(false);
    this.sleepBtn.setEnabled(false);
    this.stopChatterBubbles();
    audio.stopChatter();
    speechBubble(this, 400, 640, '(시끄럽지만... 참자...)', 1100, 40);
    this.time.delayedCall(1200, () => this.succeed('시끄러운 밤을 견뎌냈다. 내일은 조용하길...'));
  }

  // ── 리듬게임 시작 ─────────────────────────────

  private startChallenge(): void {
    if (this.finished || this.phase !== 'choose') return;
    this.phase = 'play';
    this.stopChatterBubbles(); // 수다 소리는 배경으로 계속 — 이 박자를 벽으로 끊는다
    this.punchBtn.destroy();
    this.sleepBtn.destroy();

    this.beatMs = Q5_WALLPUNCH.beatMs(this.day);
    this.goodMs = Q5_WALLPUNCH.goodMs(this.day);
    this.notes = this.buildNotes();
    this.songTime = 0;
    this.lastBeat = -1;

    this.subText.setText('👊가 링에 닿는 순간, 화면 아무 데나 탭!');
    this.missText.setVisible(true);
    this.updateMissText();
    this.ring.setVisible(true);
    this.tapLabel.setVisible(true);
    this.laneG.setVisible(true);
  }

  /**
   * 노트 배치 생성 — 온비트를 기본으로, 쉼표로 리듬을 만들고
   * 일차가 오르면 반박 노트가 따라붙는다.
   */
  private buildNotes(): RhythmNote[] {
    const count = Q5_WALLPUNCH.noteCount(this.day);
    const offbeatP = Q5_WALLPUNCH.offbeatChance(this.day);
    const times: number[] = [];
    let beat = COUNT_BEATS;
    while (times.length < count) {
      if (times.length > 0 && chance(Q5_WALLPUNCH.restChance)) {
        beat += 1;
        continue;
      }
      times.push(beat * this.beatMs);
      if (times.length < count && chance(offbeatP)) {
        times.push((beat + 0.5) * this.beatMs);
      }
      beat += 1;
    }
    return times.slice(0, count).map((t) => ({ t, obj: null, resolved: false }));
  }

  private spawnNote(note: RhythmNote): void {
    const c = this.add.container(SPAWN_X, LANE_Y).setDepth(40);
    const body = this.add.circle(0, 0, 44, 0xffffff, 1).setStrokeStyle(5, 0x000000, 1);
    const fist = this.add
      .text(0, 0, '👊', { fontFamily: FONT, fontSize: '46px' })
      .setOrigin(0.5);
    c.add([body, fist]);
    note.obj = c;
  }

  /** 박자 머리마다 — 메트로놈 째깍 + 링 펄스 + 카운트인 표시 */
  private onBeat(beatIdx: number): void {
    if (beatIdx < COUNT_BEATS) {
      const label = ['3', '2', '1', '시작!'][beatIdx];
      this.countText.setText(label).setScale(1.4).setAlpha(1);
      this.tweens.add({ targets: this.countText, scale: 1, duration: 140, ease: 'Back.easeOut' });
      if (beatIdx === COUNT_BEATS - 1) {
        audio.chime();
        this.tweens.add({
          targets: this.countText,
          alpha: 0,
          delay: 360,
          duration: 240,
        });
      } else {
        audio.tick();
      }
    } else if (this.notes.some((n) => !n.resolved)) {
      audio.tick();
    }
    this.tweens.add({ targets: this.ring, scale: { from: 1.16, to: 1 }, duration: 130 });
  }

  // ── 판정 ─────────────────────────────────────

  private onTap(
    _pointer: Phaser.Input.Pointer,
    currentlyOver: Phaser.GameObjects.GameObject[]
  ): void {
    if (this.finished || this.phase !== 'play') return;
    // 일시정지/소리 버튼 등 UI 탭은 판정하지 않는다
    if (currentlyOver.length > 0) return;

    // 아직 화면에 노트가 없으면(도전 직후 등) 헛타로 치지 않는다
    const candidates = this.notes.filter((n) => !n.resolved && n.obj !== null);
    if (candidates.length === 0) return;

    // 카운트인 동안의 성급한 탭 — 벌점 없이 타이밍만 알려준다
    if (this.songTime < this.notes[0].t - this.goodMs) {
      if (this.songTime - this.earlyPopupAt > 350) {
        this.earlyPopupAt = this.songTime;
        this.judgePopup('아직!', COLORS.textCss);
      }
      return;
    }

    // 판정창 안에 든 노트 중 **가장 이른** 것을 소비한다.
    // '가장 가까운 노트' 매칭은 엇박 노트와 판정창이 겹칠 때 탭이 뒤 노트를
    // 훔쳐가 앞 노트가 자동 미스되는 연쇄(탭 1번 = 미스 2개)를 만든다.
    let best: RhythmNote | null = null;
    let nearestDt = Infinity;
    for (const n of candidates) {
      const dt = Math.abs(this.songTime - n.t);
      if (dt <= this.goodMs && (best === null || n.t < best.t)) best = n;
      if (dt < nearestDt) nearestDt = dt;
    }
    if (best) {
      this.hitNote(best, Math.abs(this.songTime - best.t) <= Q5_WALLPUNCH.perfectMs);
      return;
    }

    // 방금 처리된(놓친) 노트를 향한 늦은 탭 — 내려오던 손가락까지 벌하진 않는다
    if (this.lastResolvedT !== null && Math.abs(this.songTime - this.lastResolvedT) <= nearestDt) {
      return;
    }

    // 박자에서 한참 벗어난 헛방망이질 — 그 쿵 소리가 제일 수상하다
    this.addMiss('엇박!!');
  }

  private hitNote(note: RhythmNote, perfect: boolean): void {
    note.resolved = true;
    this.lastResolvedT = note.t;
    this.combo += 1;
    // 첫 히트에 성공했으면 타이밍 안내는 소임을 다했다 — 치워서 콤보 시야를 비운다
    if (this.tapLabel.alpha > 0) {
      this.tweens.add({ targets: this.tapLabel, alpha: 0, duration: 250 });
    }

    // 타격 컷 반짝 + 쿵
    audio.thud();
    vibrate(HAPTIC.miniSuccess);
    this.sceneHit.setAlpha(1);
    this.time.delayedCall(100, () => {
      if (!this.finished) this.sceneHit.setAlpha(0);
    });
    this.cameras.main.shake(70, perfect ? 0.004 : 0.002);

    const obj = note.obj;
    if (obj) {
      this.tweens.add({
        targets: obj,
        scale: 1.4,
        alpha: 0,
        duration: 140,
        onComplete: () => obj.destroy(),
      });
      note.obj = null;
    }

    this.judgePopup(perfect ? '완벽!' : '좋아!', perfect ? COLORS.safeCss : COLORS.warnCss);
    this.comboText.setText(this.combo >= 2 ? `${this.combo} 콤보!` : '');
    this.comboText.setScale(1.25);
    this.tweens.add({ targets: this.comboText, scale: 1, duration: 120 });
  }

  /** 놓친 노트 — 벽 앞을 그냥 지나가 버렸다 */
  private missNote(note: RhythmNote): void {
    note.resolved = true;
    this.lastResolvedT = note.t;
    const obj = note.obj;
    if (obj) {
      this.tweens.add({
        targets: obj,
        y: LANE_Y + 46,
        alpha: 0,
        duration: 260,
        onComplete: () => obj.destroy(),
      });
      note.obj = null;
    }
    this.addMiss('놓쳤다!');
  }

  private addMiss(label: string): void {
    if (this.finished || this.phase !== 'play') return;
    this.missCount += 1;
    this.combo = 0;
    this.comboText.setText('');
    audio.buzz();
    vibrate(HAPTIC.damage);
    this.judgePopup(label, COLORS.accentCss);
    this.cameras.main.shake(140, 0.006);
    this.updateMissText();
    if (this.missCount >= Q5_WALLPUNCH.maxMiss) {
      this.busted();
      return;
    }
    if (this.missCount === Q5_WALLPUNCH.maxMiss - 1) {
      // 다음 실수 = 사망 — 은은한 비네트로는 부족하다, 대놓고 경고한다
      this.setDanger('in');
      const warn = this.add
        .text(GAME_WIDTH / 2 + 60, 430, '💢 한 번만 더 실수하면 발각!!', {
          fontFamily: FONT,
          fontSize: '38px',
          color: COLORS.accentCss,
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 7,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setScale(0.5);
      this.tweens.add({ targets: warn, scale: 1, duration: 160, ease: 'Back.easeOut' });
      this.tweens.add({
        targets: warn,
        alpha: 0,
        delay: 1400,
        duration: 300,
        onComplete: () => warn.destroy(),
      });
    }
  }

  private updateMissText(): void {
    const max = Q5_WALLPUNCH.maxMiss;
    this.missText.setText(`실수 ${'💢'.repeat(this.missCount)}${'⚪'.repeat(Math.max(0, max - this.missCount))}`);
  }

  private judgePopup(label: string, color: string): void {
    const t = this.add
      .text(RING_X, LANE_Y - 92, label, {
        fontFamily: FONT,
        fontSize: '42px',
        color,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(42);
    this.tweens.add({
      targets: t,
      y: LANE_Y - 150,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  // ── 결말 ─────────────────────────────────────

  /** 어긋난 쿵 소리 3번 — 소음이 복도까지 울렸다 */
  private busted(): void {
    this.phase = 'done';
    this.setDanger('off');
    audio.stopChatter();
    for (const n of this.notes) {
      n.obj?.destroy();
      n.obj = null;
    }

    // 정적... 그리고 복도에서 발소리
    this.dim.setFillStyle(0x000000, 0.5);
    this.suspenseText.setText('. . .');
    audio.startHeartbeat();
    this.time.delayedCall(750, () => {
      if (this.finished) return;
      audio.stopHeartbeat();
      audio.door();
      const senior = new Cadet(this, GAME_WIDTH - 160, 620, 'senior');
      senior.setScale(0.85);
      this.failCaught(
        senior,
        '박자를 놓친 쿵 소리가 복도까지 울렸다... 순찰 선배가 문을 벌컥!',
        '옆방에서 뭐 하냐?'
      );
    });
  }

  private finishClear(): void {
    if (this.finished || this.phase !== 'play') return;
    this.phase = 'done';
    this.setDanger('off');
    audio.stopChatter();
    speechBubble(this, 400, 640, '......조용해졌다.', 1400, 40);

    const fullCombo = this.missCount === 0;
    // 연습 모드에서는 목숨 보상이 없다
    const gained =
      fullCombo && !gameState.practiceMode
        ? gameState.addLifeUnits(Q5_WALLPUNCH.fullComboLifeUnits)
        : false;
    if (gained) {
      audio.chime();
      vibrate(HAPTIC.lifeGain);
      const lifeText = this.add
        .text(GAME_WIDTH / 2 + 60, 560, '노미스! ❤️ 목숨 +1', {
          fontFamily: FONT,
          fontSize: '52px',
          color: COLORS.safeCss,
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setScale(0.4);
      this.tweens.add({
        targets: lifeText,
        scale: 1,
        y: 500,
        duration: 500,
        ease: 'Back.easeOut',
      });
    }
    this.time.delayedCall(1500, () =>
      this.succeed(
        gained
          ? '노미스 클리어! ❤️ 목숨을 하나 얻고 꿀잠에 들었다.'
          : fullCombo
            ? gameState.practiceMode
              ? '노미스 클리어! (연습이라 보상은 없다)'
              : '노미스 클리어! (목숨은 이미 가득)'
            : '옆방이 조용해졌다. 오늘 밤은 꿀잠이다.'
      )
    );
  }

  // ── 프레임 루프 ──────────────────────────────

  protected tick(delta: number): void {
    if (this.phase !== 'play') return;
    // 씬 pause(미니퀘스트·일시정지) 동안 시계가 흐르지 않도록 delta 누적으로 굴린다
    this.songTime += delta;

    const beatIdx = Math.floor(this.songTime / this.beatMs);
    if (beatIdx !== this.lastBeat) {
      this.lastBeat = beatIdx;
      this.onBeat(beatIdx);
    }

    for (const n of this.notes) {
      if (n.resolved) continue;
      if (!n.obj && this.songTime >= n.t - Q5_WALLPUNCH.approachMs) this.spawnNote(n);
      if (n.obj) {
        n.obj.x =
          RING_X + ((n.t - this.songTime) / Q5_WALLPUNCH.approachMs) * (SPAWN_X - RING_X);
      }
      if (this.songTime > n.t + this.goodMs) this.missNote(n);
      // missNote → addMiss → busted로 phase가 바뀌었으면 즉시 중단
      if (this.phase !== 'play') return;
    }

    if (!this.endScheduled && this.notes.every((n) => n.resolved)) {
      this.endScheduled = true;
      this.time.delayedCall(450, () => this.finishClear());
    }
  }
}

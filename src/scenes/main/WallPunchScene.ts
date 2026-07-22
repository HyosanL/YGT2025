import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q5_WALLPUNCH } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import { textChip } from '../../ui/Button';
import { Cadet, speechBubble } from '../../ui/Characters';
import { addSceneBg, addVignette } from '../../ui/Scenery';
import { HAPTIC, vibrate } from '../../utils/haptics';
import { chance, pick, randFloat, randInt } from '../../utils/rng';
import { BaseMainScene } from './BaseMainScene';

/**
 * 배경(bg_wallpunch_*)에서 옆방과 맞닿은 벽이 있는 화면 왼쪽 —
 * 말풍선과 충격 연출이 새어나오는 지점.
 */
const WALL_X = 150;

/** 판정 링 x — 벽에 바짝 붙여서 '실제로 벽을 두드리는' 느낌을 만든다 */
const RING_X = WALL_X - 22;
/** 노트가 태어나는 화면 오른쪽 바깥 */
const SPAWN_X = GAME_WIDTH + 70;
/** 카운트인 박자 수 — '3, 2, 1, 시작!' 뒤 첫 노트가 온다 */
const COUNT_BEATS = 4;
/** 인트로(옆방 수다 구경) — 이후 자동으로 리듬게임이 시작된다 */
const INTRO_MS = 1100;

/** 벽 너머 1학년들의 수다 (인트로 동안) */
const CHATTER_LINES = [
  'ㅋㅋㅋㅋㅋ',
  '아 진짜라니까?',
  '미쳤나봐 ㅋㅋ',
  '야 조용히 해봐 ㅋㅋ',
  '한 판만 더 하자',
  '아 배고파...',
  'ㄹㅇㅋㅋ',
];

type PunchPhase = 'intro' | 'play' | 'done';

interface RhythmNote {
  /** 판정 링 도달 시각 (songTime 기준 ms) */
  t: number;
  /** 벽의 어느 높이를 칠 노트인지 (laneYs 인덱스) */
  lane: number;
  /**
   * 이른 쪽 판정 반경 (ms) — 기본 goodMs지만, 앞 노트와의 간격이 좁으면(엇박 190ms)
   * 간격의 절반으로 줄인다. 안 그러면 창이 겹쳐 앞 노트를 친 직후의 연타가
   * 뒤 노트를 리듬과 무관하게 훔쳐 먹는다.
   */
  earlyMs: number;
  obj: Phaser.GameObjects.Container | null;
  resolved: boolean;
}

/**
 * Q5. 옆방(1학년 방) 벽 치기 — 샤워장 노래에 맞춘 리듬게임 (자동 시작).
 * 옆방이 시끄럽다. 노래 박자에 맞춰 벽 여기저기를 두드려 제압하라.
 * - 👊 노트가 오른쪽에서 흘러와 벽의 판정 링(위/중간/아래)에 닿는 순간,
 *   **그 노트 높이의 화면**을 탭.
 * - 놓치거나 엇박, 다른 높이를 치면 💢 — 3번 쌓이면 소음이 복도까지 울려
 *   순찰 선배에게 발각.
 * - 노미스로 끝내면 옆방을 완전히 제압 — ❤️ 목숨 +1칸.
 */
export class WallPunchScene extends BaseMainScene {
  private phase: PunchPhase = 'intro';
  private chatterEvent: Phaser.Time.TimerEvent | null = null;

  private dim!: Phaser.GameObjects.Rectangle;
  private suspenseText!: Phaser.GameObjects.Text;
  /** 벽 치는 컷 — 누운 컷 위에 겹쳐 두고 알파만 켜서 타격 순간을 만든다 */
  private sceneHit!: Phaser.GameObjects.Image;

  // ── 리듬 상태 ──
  /** 씬 pause에 흔들리지 않도록 delta 누적으로 굴리는 곡 시계 (ms) */
  private songTime = 0;
  private lastBeat = -1;
  /** 오늘의 박자 간격 — 노래 배속에 맞춰 일차마다 짧아진다 */
  private beatMs = 380;
  private goodMs: number = Q5_WALLPUNCH.goodMs;
  private notes: RhythmNote[] = [];
  private missCount = 0;
  private combo = 0;
  private endScheduled = false;
  /** 마지막으로 처리(히트/미스)된 노트의 t — 그쪽을 향한 늦은 탭은 벌점 없이 무시 */
  private lastResolvedT: number | null = null;
  /** '아직!' 안내 팝업 스로틀 (songTime 기준) */
  private earlyPopupAt = -1000;

  /** 벽 타격 지점(레인)의 y 좌표들 — 일차에 따라 2~3개 */
  private laneYs: number[] = [];

  private subText!: Phaser.GameObjects.Text;
  private missText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private rings: Phaser.GameObjects.Container[] = [];
  private tapLabel!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'wallpunch' });
  }

  /** 샤워장 노래가 이 판의 비트 — 별도 BGM은 끈다 */
  protected bgmTrack(): null {
    return null;
  }

  /** 밀리초 판정이 도는 리듬게임 — 미니 퀘스트 난입은 억울한 미스만 만든다 */
  protected allowsMini(): boolean {
    return false;
  }

  create(): void {
    this.phase = 'intro';
    this.chatterEvent = null;
    this.songTime = 0;
    this.lastBeat = -1;
    this.goodMs = Q5_WALLPUNCH.goodMs;
    this.notes = [];
    this.missCount = 0;
    this.combo = 0;
    this.endScheduled = false;
    this.lastResolvedT = null;
    this.earlyPopupAt = -1000;
    this.rings = [];

    // 실제 호실 사진을 그대로 옮긴 야간 씬 — 인물이 그 방의 그 침대에 누워 있다.
    addSceneBg(this, 'bg_wallpunch_idle');
    this.sceneHit = addSceneBg(this, 'bg_wallpunch_hit', -999).setAlpha(0);
    addVignette(this, 0.35);

    // 일차에 따라 벽 타격 지점 2~3개 (위/중간/아래)
    this.laneYs = Q5_WALLPUNCH.laneCount(gameState.day) >= 3 ? [430, 600, 770] : [500, 700];

    textChip(this, GAME_WIDTH / 2 + 60, 120, '옆방이 너무 시끄럽다...', { fontSize: 38, depth: 10 });
    this.subText = this.add
      .text(GAME_WIDTH / 2 + 60, 200, '노래 박자에 맞춰 벽을 두드려 제압하라! (미스 3번 = 발각)', {
        fontFamily: FONT,
        fontSize: '24px',
        color: COLORS.inkCss,
        stroke: '#ffffff',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(11);

    // 미스 슬롯 — 3칸이 다 차는 순간 발각
    this.missText = this.add
      .text(GAME_WIDTH / 2 + 60, GAME_HEIGHT - 140, '', {
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
      .text(GAME_WIDTH / 2 + 60, 320, '', {
        fontFamily: FONT,
        fontSize: '88px',
        color: COLORS.warnCss,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(45);

    this.createLanes();

    const bottomLaneY = this.laneYs[this.laneYs.length - 1] ?? 700;
    this.comboText = this.add
      .text(RING_X + 30, bottomLaneY + 116, '', {
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

    // 리듬 입력 — 노트가 링에 닿는 순간, 그 노트 높이의 화면을 탭
    this.input.on('pointerdown', this.onTap, this);

    this.setupCommon();
    this.startNoisy();
    // 구경할 틈만 잠깐 주고 자동으로 판이 시작된다 — 도박이 아니라 오늘 밤의 임무다
    this.time.delayedCall(INTRO_MS, () => this.startChallenge());
  }

  /** 판정 링(레인별) + 노트가 흐르는 레인 가이드 */
  private createLanes(): void {
    const g = this.add.graphics().setDepth(30);
    for (const y of this.laneYs) {
      g.lineStyle(4, 0xffffff, 0.3);
      g.lineBetween(RING_X, y, GAME_WIDTH, y);

      const ring = this.add.container(RING_X, y).setDepth(31);
      const outer = this.add.circle(0, 0, 56, 0x000000, 0).setStrokeStyle(7, COLORS.warn, 1);
      const inner = this.add.circle(0, 0, 44, 0xffffff, 0.14).setStrokeStyle(3, 0x000000, 0.8);
      ring.add([outer, inner]);
      this.rings.push(ring);
    }

    const midY = this.laneYs[Math.floor(this.laneYs.length / 2)] ?? 600;
    this.tapLabel = this.add
      .text(RING_X + 10, midY + 62, '👊가 닿는 순간, 그 높이를 탭!', {
        fontFamily: FONT,
        fontSize: '22px',
        color: COLORS.warnCss,
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 0)
      .setDepth(31);
  }

  // ── 옆방 수다 (인트로) ─────────────────────────

  private startNoisy(): void {
    if (this.finished) return;
    audio.startChatter();
    this.spawnChatterBubble();
    this.chatterEvent = this.time.addEvent({
      delay: 700,
      loop: true,
      callback: () => {
        if (!this.finished && this.phase === 'intro') {
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

  // ── 리듬게임 시작 ─────────────────────────────

  private startChallenge(): void {
    if (this.finished || this.phase !== 'intro') return;
    this.phase = 'play';
    this.stopChatterBubbles();
    audio.stopChatter();

    this.beatMs = Q5_WALLPUNCH.beatMs(this.day);
    this.notes = this.buildNotes();
    this.songTime = 0;
    this.lastBeat = -1;

    this.subText.setText('👊가 링에 닿는 순간, 그 높이의 화면을 탭!');
    this.missText.setVisible(true);
    this.updateMissText();

    // 샤워장에서 몰래 틀던 그 노래 — 일차가 오를수록 배속이 붙는다
    audio.startSong(Q5_WALLPUNCH.songRate(this.day));
  }

  /**
   * 노트 배치 생성 — 노래의 박자 격자(beatMs) 위에 온비트를 깔고, 쉼표로 리듬을
   * 만들고, 일차가 오르면 반박 노트가 따라붙는다. 반박은 같은 자리 연타(둥-둥)라
   * 손이 따라갈 수 있다. 온비트마다 벽의 다른 높이가 걸린다.
   */
  private buildNotes(): RhythmNote[] {
    const count = Q5_WALLPUNCH.noteCount(this.day);
    const offbeatP = Q5_WALLPUNCH.offbeatChance(this.day);
    const beatMs = this.beatMs;
    const lead = Q5_WALLPUNCH.songLeadMs;
    const laneCount = this.laneYs.length;
    const out: RhythmNote[] = [];
    let beat = COUNT_BEATS;
    while (out.length < count) {
      if (out.length > 0 && chance(Q5_WALLPUNCH.restChance)) {
        beat += 1;
        continue;
      }
      const lane = randInt(0, laneCount - 1);
      out.push({ t: lead + beat * beatMs, lane, earlyMs: this.goodMs, obj: null, resolved: false });
      if (out.length < count && chance(offbeatP)) {
        out.push({
          t: lead + (beat + 0.5) * beatMs,
          lane,
          earlyMs: this.goodMs,
          obj: null,
          resolved: false,
        });
      }
      beat += 1;
    }
    const notes = out.slice(0, count);
    // 이른 쪽 창을 앞 노트와의 간격 절반으로 클램프 (겹침 방지)
    for (let i = 1; i < notes.length; i++) {
      const cur = notes[i];
      const prev = notes[i - 1];
      if (cur && prev) cur.earlyMs = Math.min(cur.earlyMs, (cur.t - prev.t) / 2);
    }
    return notes;
  }

  private spawnNote(note: RhythmNote): void {
    const y = this.laneYs[note.lane] ?? 600;
    const c = this.add.container(SPAWN_X, y).setDepth(40);
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
        this.tweens.add({ targets: this.countText, alpha: 0, delay: 320, duration: 220 });
      } else {
        audio.tick();
      }
    } else if (this.notes.some((n) => !n.resolved)) {
      audio.tick();
    }
    for (const ring of this.rings) {
      this.tweens.add({ targets: ring, scale: { from: 1.16, to: 1 }, duration: 130 });
    }
  }

  // ── 판정 ─────────────────────────────────────

  /** 탭한 y가 가장 가까운 레인 */
  private nearestLane(y: number): number {
    let best = 0;
    let bestD = Infinity;
    this.laneYs.forEach((ly, i) => {
      const d = Math.abs(y - ly);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  private onTap(
    pointer: Phaser.Input.Pointer,
    currentlyOver: Phaser.GameObjects.GameObject[]
  ): void {
    if (this.finished || this.phase !== 'play') return;
    // 일시정지/소리 버튼 등 UI 탭은 판정하지 않는다
    if (currentlyOver.length > 0) return;

    // 아직 화면에 노트가 없으면(시작 직후 등) 헛타로 치지 않는다
    const spawned = this.notes.filter((n) => !n.resolved && n.obj !== null);
    if (spawned.length === 0) return;

    // 카운트인 동안의 성급한 탭 — 벌점 없이 타이밍만 알려준다
    const first = this.notes[0];
    if (first && this.songTime < first.t - this.goodMs) {
      if (this.songTime - this.earlyPopupAt > 350) {
        this.earlyPopupAt = this.songTime;
        this.judgePopup('아직!', COLORS.textCss, this.laneYs[1] ?? 600);
      }
      return;
    }

    const tapLane = this.nearestLane(pointer.y);

    // 판정창 안에 든 노트 중 **가장 이른** 것을 소비한다.
    // '가장 가까운 노트' 매칭은 엇박 노트와 창이 겹칠 때 탭이 뒤 노트를 훔쳐가
    // 앞 노트가 자동 미스되는 연쇄(탭 1번 = 미스 2개)를 만들기 때문.
    // 이른 쪽은 노트별 earlyMs(간격 절반 클램프)로 판정해 창 겹침 자체를 없앤다.
    const inWindow = (n: RhythmNote): boolean =>
      this.songTime <= n.t
        ? n.t - this.songTime <= n.earlyMs
        : this.songTime - n.t <= this.goodMs;
    let inLane: RhythmNote | null = null;
    let anyLane: RhythmNote | null = null;
    let nearestDt = Infinity;
    for (const n of spawned) {
      const dt = Math.abs(this.songTime - n.t);
      if (inWindow(n)) {
        if (n.lane === tapLane && (inLane === null || n.t < inLane.t)) inLane = n;
        if (anyLane === null || n.t < anyLane.t) anyLane = n;
      }
      if (dt < nearestDt) nearestDt = dt;
    }
    if (inLane) {
      this.hitNote(inLane, Math.abs(this.songTime - inLane.t) <= Q5_WALLPUNCH.perfectMs);
      return;
    }
    if (anyLane) {
      // 타이밍은 맞았는데 벽의 다른 높이를 쳤다 — 그 노트를 소비하며 미스 1 (이중 과금 방지)
      this.consumeWrongSpot(anyLane);
      return;
    }

    // 방금 처리된 노트를 향한 늦은 탭 — 내려오던 손가락까지 벌하진 않는다.
    // 단 200ms 안쪽일 때만: 상한 없이 봐주면 노트 사이 아무 때나 두드려도 무벌점이 된다.
    if (
      this.lastResolvedT !== null &&
      Math.abs(this.songTime - this.lastResolvedT) <= 200 &&
      Math.abs(this.songTime - this.lastResolvedT) <= nearestDt
    ) {
      return;
    }

    // 박자에서 한참 벗어난 헛방망이질 — 그 쿵 소리가 제일 수상하다
    this.addMiss('엇박!!', tapLane);
  }

  private hitNote(note: RhythmNote, perfect: boolean): void {
    note.resolved = true;
    this.lastResolvedT = note.t;
    this.combo += 1;
    // 첫 히트에 성공했으면 타이밍 안내는 소임을 다했다
    if (this.tapLabel.alpha > 0) {
      this.tweens.add({ targets: this.tapLabel, alpha: 0, duration: 250 });
    }

    // 타격 컷 반짝 + 실감나는 쿵 + 화면이 울리는 흔들림 (perfect는 더 세게)
    audio.thud(perfect);
    vibrate(HAPTIC.miniSuccess);
    this.sceneHit.setAlpha(1);
    this.time.delayedCall(100, () => {
      if (!this.finished) this.sceneHit.setAlpha(0);
    });
    this.cameras.main.shake(120, perfect ? 0.011 : 0.007);

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

    const laneY = this.laneYs[note.lane] ?? 600;
    this.judgePopup(perfect ? '완벽!' : '좋아!', perfect ? COLORS.safeCss : COLORS.warnCss, laneY);
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
        y: (this.laneYs[note.lane] ?? 600) + 46,
        alpha: 0,
        duration: 260,
        onComplete: () => obj.destroy(),
      });
      note.obj = null;
    }
    this.addMiss('놓쳤다!', note.lane);
  }

  /** 타이밍은 맞았지만 다른 높이를 친 경우 — 해당 노트를 소비하며 미스 1회만 */
  private consumeWrongSpot(note: RhythmNote): void {
    note.resolved = true;
    this.lastResolvedT = note.t;
    const obj = note.obj;
    if (obj) {
      this.tweens.add({
        targets: obj,
        alpha: 0,
        scale: 0.7,
        duration: 200,
        onComplete: () => obj.destroy(),
      });
      note.obj = null;
    }
    this.addMiss('자리가 달라!', note.lane);
  }

  private addMiss(label: string, lane: number): void {
    if (this.finished || this.phase !== 'play') return;
    this.missCount += 1;
    this.combo = 0;
    this.comboText.setText('');
    // 잘못 친 벽에서는 민망한 "뿡" 소리가 난다
    audio.fart();
    vibrate(HAPTIC.damage);
    this.judgePopup(label, COLORS.accentCss, this.laneYs[lane] ?? 600);
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
        .text(GAME_WIDTH / 2 + 60, GAME_HEIGHT - 240, '💢 한 번만 더 실수하면 발각!!', {
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
    this.missText.setText(
      `실수 ${'💢'.repeat(this.missCount)}${'⚪'.repeat(Math.max(0, max - this.missCount))}`
    );
  }

  private judgePopup(label: string, color: string, laneY: number): void {
    const t = this.add
      .text(RING_X, laneY - 78, label, {
        fontFamily: FONT,
        fontSize: '40px',
        color,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(42);
    this.tweens.add({
      targets: t,
      y: laneY - 132,
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
    audio.stopSong();
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
    audio.stopSong();
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
    // 씬 pause(일시정지) 동안 시계가 흐르지 않도록 delta 누적으로 굴린다
    this.songTime += delta;
    // 일시정지 복귀·오디오 언락 지연에도 노래가 게임 시계 위치로 따라오게 (매 프레임 안전)
    audio.syncSong(this.songTime);

    // 박 격자는 노트/가청 비트와 같은 songLeadMs 오프셋 위에 있다 —
    // 이걸 빼지 않으면 메트로놈·링 펄스가 노래보다 100ms 빨라 박치기 게임이 된다
    const beatIdx = Math.floor((this.songTime - Q5_WALLPUNCH.songLeadMs) / this.beatMs);
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

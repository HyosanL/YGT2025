import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q2_HALLWAY } from '../../config';
import { audio } from '../../core/AudioManager';
import { Button, textChip, type TextChip } from '../../ui/Button';
import { Cadet, speechBubble } from '../../ui/Characters';
import { addSceneBg } from '../../ui/Scenery';
import { BaseMainScene } from './BaseMainScene';

type VisitorKind = 'junior' | 'peer' | 'senior';
type Action = 'greet' | 'salute';

const RANK_OF: Record<VisitorKind, 1 | 2 | 3> = { junior: 1, peer: 2, senior: 3 };

// ── 복도 원근 ────────────────────────────────────
/**
 * bg_hallway는 1점 투시다. 아래 값들은 배경 PNG에서 **벽 밑단(굽도리 아래 선)을 픽셀로 찾아
 * 좌우 직선을 피팅한 뒤 교점을 구해** 실측한 것이다 (눈대중 배치가 캐릭터를 공중에 띄웠다).
 *
 * 바닥 위의 한 점은 k로 나타낸다: k=0이 소실점(복도 저 끝), k=1이 화면 맨 아래(코앞).
 * 화면 좌표·크기는 전부 k 하나에서 나오므로 발이 바닥에서 뜨지 않는다.
 */
const VANISH_X = GAME_WIDTH / 2;
const VANISH_Y = GAME_HEIGHT * 0.529;
/** 화면 맨 아래(k=1)에서 좌우 벽 밑단의 x — 여기서 소실점으로 수렴한다 */
const NEAR_WALL_L = -278;
const NEAR_WALL_R = 992;

const floorY = (k: number): number => VANISH_Y + (GAME_HEIGHT - VANISH_Y) * k;
const wallX = (k: number, side: -1 | 1): number =>
  VANISH_X + k * ((side === -1 ? NEAR_WALL_L : NEAR_WALL_R) - VANISH_X);

/**
 * 바닥 깊이에 따른 사람의 화면상 키 = 실제 사람 크기.
 * 카메라 눈높이가 곧 소실점 높이이므로 사람의 눈은 거리와 무관하게 소실점 선에 온다.
 * 즉 화면상 키 ≈ (발끝y − 소실점y) × (전신/눈높이 ≈ 1.06).
 */
const heightAt = (feetYPx: number): number => Math.max(40, (feetYPx - VANISH_Y) * 1.06);

/** 좌우 벽의 문 위치 (깊이 k) — 여기서 사람이 나온다 */
const DOOR_DEPTHS = [0.62, 0.46, 0.33] as const;
/** 내 앞 판정 지점 — 조작 버튼 위에서 멈추도록 잡은 깊이 */
const ARRIVE_K = 0.66;

interface Visitor {
  cadet: Cadet;
  kind: VisitorKind;
  side: -1 | 1;
  /** 출발 깊이 */
  fromK: number;
  /** 도착(판정) 시각 — 씬 경과 ms */
  hitAtMs: number;
  spawnedAtMs: number;
  resolved: boolean;
  /** 판정 링 */
  ring: Phaser.GameObjects.Graphics;
}

/**
 * Q2. 복도 인사/경례 — **리듬 게임**.
 * 사람들이 복도 양옆 문에서 일정한 박자로 나와, 바닥을 따라 정확히 두 박자 만에 내 앞에 선다.
 * 도착하는 그 박자에 맞춰(±판정창) 올바른 응대를 눌러야 한다:
 * - 견장 1줄 후배·2줄 동기 → 🙇 인사
 * - 견장 3줄 선배 → 🫡 경례. **늦으면 안 된다** — 판정창을 넘기면 그대로 잡혀간다.
 * 견장 확대 배지는 없앴다. 단서는 캐릭터 어깨의 견장 줄 수뿐이라 눈으로 읽어내야 한다.
 */
export class HallwayScene extends BaseMainScene {
  private visitors: Visitor[] = [];
  private elapsedMs = 0;
  private beatMs = 1000;
  private hitWindowMs = 400;
  private nextSpawnBeat = 0;
  private spawned = 0;
  private cleared = 0;
  private target = 6;
  private comboText!: TextChip;
  private judgeText!: Phaser.GameObjects.Text;
  private beatLine!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'hallway' });
  }

  create(): void {
    this.visitors = [];
    this.elapsedMs = 0;
    this.spawned = 0;
    this.cleared = 0;
    this.nextSpawnBeat = 1;

    addSceneBg(this, 'bg_hallway');

    this.comboText = textChip(this, GAME_WIDTH / 2, 90, '0 / 0', { fontSize: 38, depth: 10 });

    // 판정 순간 뜨는 큰 글자 (PERFECT / 늦음 / 실수)
    this.judgeText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 300, '', {
        fontFamily: FONT,
        fontSize: '46px',
        fontStyle: 'bold',
        color: COLORS.safeCss,
        stroke: '#000000',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setAlpha(0);

    // 박자 표시 — 판정선이 박자마다 번쩍인다
    this.beatLine = this.add.graphics().setDepth(9);

    new Button(this, GAME_WIDTH / 2 - 165, GAME_HEIGHT - 130, {
      label: '🙇 인사',
      width: 310,
      height: 120,
      color: COLORS.accent,
      fontSize: 38,
      onClick: () => this.press('greet'),
    });
    new Button(this, GAME_WIDTH / 2 + 165, GAME_HEIGHT - 130, {
      label: '🫡 경례',
      width: 310,
      height: 120,
      color: COLORS.panelLight,
      fontSize: 38,
      onClick: () => this.press('salute'),
    });
    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT - 42,
        '박자에 맞춰! 견장 1·2줄 → 🙇 인사 / 3줄 → 🫡 경례\n선배에게 늦게 경례해도 끝장이다',
        {
          fontFamily: FONT,
          fontSize: '23px',
          color: COLORS.inkCss,
          align: 'center',
          lineSpacing: 6,
          // 배경 그림 위 글자는 흰 테두리로 파먹어 읽히게 한다 (반투명 박스 대신)
          stroke: '#ffffff',
          strokeThickness: 5,
        }
      )
      .setOrigin(0.5);

    this.setupCommon();
    this.target = Q2_HALLWAY.targetCount(this.day);
    this.beatMs = Q2_HALLWAY.beatMs(this.day);
    this.hitWindowMs = Q2_HALLWAY.hitWindowMs(this.day);
    this.updateCombo();
  }

  private updateCombo(): void {
    this.comboText.setText(`${this.cleared} / ${this.target}`);
  }

  private pickKind(): VisitorKind {
    const seniorP = Q2_HALLWAY.seniorShare(this.day);
    const roll = Math.random();
    if (roll < seniorP) return 'senior';
    if (roll < seniorP + Q2_HALLWAY.peerShare) return 'peer';
    return 'junior';
  }

  // ── 스폰 ─────────────────────────────────────

  private spawn(beat: number): void {
    const kind = this.pickKind();
    const side: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
    const fromK = DOOR_DEPTHS[Math.floor(Math.random() * DOOR_DEPTHS.length)] ?? 0.46;

    const cadet = new Cadet(this, wallX(fromK, side), 0, kind, false, {
      visitorRank: RANK_OF[kind],
    });
    cadet.setDepth(5);
    cadet.setMotion('walk');
    this.place(cadet, fromK, wallX(fromK, side));

    // 도착 박자에 정확히 맞춰 줄어드는 판정 링
    const ring = this.add.graphics().setDepth(6);

    this.visitors.push({
      cadet,
      kind,
      side,
      fromK,
      spawnedAtMs: this.elapsedMs,
      hitAtMs: (beat + Q2_HALLWAY.approachBeats) * this.beatMs,
      resolved: false,
      ring,
    });
    audio.door();
    this.spawned += 1;
  }

  /** 깊이 k와 x를 받아 발끝이 바닥에 닿도록 배치 */
  private place(cadet: Cadet, k: number, x: number): void {
    const feet = floorY(k);
    const s = heightAt(feet) / 300;
    cadet.setScale(s).setPosition(x, feet - 120 * s);
  }

  // ── 입력 판정 ─────────────────────────────────

  /** 지금 판정 대상 = 도착 시각이 가장 가까운, 아직 처리 안 된 사람 */
  private currentTarget(): Visitor | null {
    let best: Visitor | null = null;
    for (const v of this.visitors) {
      if (v.resolved) continue;
      if (!best || Math.abs(v.hitAtMs - this.elapsedMs) < Math.abs(best.hitAtMs - this.elapsedMs)) {
        best = v;
      }
    }
    return best;
  }

  private press(action: Action): void {
    if (this.finished) return;
    const v = this.currentTarget();
    if (!v) return;
    const off = this.elapsedMs - v.hitAtMs;
    if (off < -this.hitWindowMs) {
      // 아직 판정창이 열리지 않았다 — 성급한 손이 곧 실수
      this.flashJudge('너무 빨라!', COLORS.warnCss);
      this.miss(v, '박자보다 먼저 튀어나갔다');
      return;
    }
    this.resolve(v, action, Math.abs(off));
  }

  private resolve(v: Visitor, action: Action, offMs: number): void {
    v.resolved = true;
    v.ring.destroy();
    const correct: Action = v.kind === 'senior' ? 'salute' : 'greet';

    if (action !== correct) {
      if (v.kind === 'senior') {
        v.cadet.setMotion('idle');
        this.failCaught(v.cadet, '3학년 선배를 고개 까딱으로 받아버렸다...', '너 지금 뭐 했냐?');
        return;
      }
      this.flashJudge('실수!', COLORS.accentCss);
      speechBubble(this, v.cadet.x, v.cadet.y - 190, '풉 ㅋㅋ 왜 경례함?', 800);
      this.applyDamage(
        v.kind === 'peer' ? Q2_HALLWAY.hpSalutePeer : Q2_HALLWAY.hpSaluteJunior,
        v.kind === 'peer' ? '동기한테 경례해버렸다... 개쪽팔림' : '후배한테 경례로 받아버렸다...'
      );
      this.retire(v);
      return;
    }

    // 정타 — 박자에 얼마나 붙었는지로 등급을 준다
    const grade = offMs < this.hitWindowMs * 0.4 ? 'PERFECT!' : 'GOOD';
    this.flashJudge(grade, grade === 'PERFECT!' ? COLORS.safeCss : COLORS.warnCss);
    audio.chime();
    if (action === 'salute') v.cadet.saluteOnce(500);
    this.cleared += 1;
    this.updateCombo();
    this.retire(v);

    if (this.cleared >= this.target) {
      this.succeed('한 박자도 놓치지 않고 복도를 통과했다!');
    }
  }

  /** 박자를 놓쳤다 */
  private miss(v: Visitor, reason: string): void {
    v.resolved = true;
    v.ring.destroy();
    if (v.kind === 'senior') {
      v.cadet.setMotion('idle');
      this.failCaught(v.cadet, `선배 앞에서 ${reason}...`, '일로 와봐.');
      return;
    }
    this.applyDamage(Q2_HALLWAY.hpMiss, `${reason}... 어색해졌다`);
    this.retire(v);
  }

  /** 판정이 끝난 사람은 나를 지나쳐 화면 밖으로 걸어 나간다 */
  private retire(v: Visitor): void {
    this.tweens.add({
      targets: v.cadet,
      y: v.cadet.y + 260,
      alpha: 0,
      duration: 420,
      onComplete: () => v.cadet.destroy(),
    });
    this.visitors = this.visitors.filter((x) => x !== v);
  }

  private flashJudge(text: string, color: string): void {
    this.judgeText.setText(text).setColor(color).setAlpha(1).setScale(0.6);
    this.tweens.killTweensOf(this.judgeText);
    this.tweens.add({ targets: this.judgeText, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.judgeText, alpha: 0, delay: 420, duration: 220 });
  }

  // ── 프레임 ────────────────────────────────────

  protected tick(delta: number): void {
    this.elapsedMs += delta;
    const beat = this.elapsedMs / this.beatMs;

    // 박자마다 한 명씩 문에서 나온다 (필요 인원을 다 내보낼 때까지)
    while (this.spawned < this.target + 2 && beat >= this.nextSpawnBeat) {
      this.spawn(this.nextSpawnBeat);
      this.nextSpawnBeat += 1;
    }

    // 판정선 — 박자에 맞춰 밝아졌다 사그라든다
    const phase = beat - Math.floor(beat);
    this.beatLine.clear();
    this.beatLine.fillStyle(0xffffff, 0.1 + 0.22 * (1 - phase));
    this.beatLine.fillRect(0, floorY(ARRIVE_K) - 6, GAME_WIDTH, 12);

    for (const v of [...this.visitors]) {
      if (v.resolved) continue;
      // 문에서 나와 판정 지점까지 — 바닥을 따라 일정한 박자로 다가온다
      const u = Phaser.Math.Clamp(
        (this.elapsedMs - v.spawnedAtMs) / (v.hitAtMs - v.spawnedAtMs),
        0,
        1
      );
      const k = Phaser.Math.Linear(v.fromK, ARRIVE_K, u);
      // 벽(문) 앞에서 출발해 복도 한가운데로 합류하며 다가온다
      const x = Phaser.Math.Linear(wallX(k, v.side), VANISH_X + v.side * 55, Math.min(1, u * 1.4));
      this.place(v.cadet, k, x);

      // 판정 링 — 발밑에 깔린 작은 고리가 도착 박자에 딱 맞춰 오므라든다.
      // (사람 크기로 그리면 화면을 뒤덮어 정작 견장이 안 보인다)
      const off = this.elapsedMs - v.hitAtMs;
      const feet = floorY(k);
      const inWindow = Math.abs(off) < this.hitWindowMs;
      const base = 46 * (heightAt(feet) / 400);
      const r = base * (1 + Math.min(1.8, Math.max(0, -off) / this.beatMs));
      v.ring.clear();
      v.ring.lineStyle(5, inWindow ? COLORS.safe : COLORS.ink, inWindow ? 1 : 0.5);
      v.ring.strokeEllipse(v.cadet.x, feet, r * 2, r * 0.8);

      if (off > this.hitWindowMs) {
        this.flashJudge('놓쳤다!', COLORS.accentCss);
        this.miss(v, '박자를 놓쳤다');
        return;
      }
    }
  }
}

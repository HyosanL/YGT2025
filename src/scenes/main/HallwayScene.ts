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

/**
 * 사람이 나오는 문의 깊이.
 * 복도가 짧게 느껴진다는 피드백에 따라 **저 끝 문(k=0.14)까지** 열어 두었다 —
 * 멀리서 걸어올수록 견장을 읽을 시간이 길어지므로 난이도 조절 폭도 넓어진다.
 */
const DOOR_DEPTHS = [0.14, 0.2, 0.28] as const;
/** 내 앞을 지나치는 지점 (k=1이면 화면 밖) */
const ARRIVE_K = 0.86;

interface Visitor {
  cadet: Cadet;
  kind: VisitorKind;
  side: -1 | 1;
  fromK: number;
  /** 이 사람이 걷기 시작한 시각 */
  startedAtMs: number;
  /** 걸어오는 데 걸리는 시간 */
  travelMs: number;
  resolved: boolean;
}

/**
 * Q2. 복도 인사/경례.
 *
 * 사람이 복도 **저 끝 양옆 문에서 한 명씩 순서대로** 나와 바닥을 따라 나에게 걸어온다.
 * 동시에 우르르 나오지 않으므로 한 명을 처리하면 다음 사람이 나온다.
 *
 * - 견장 1줄 후배·2줄 동기 → 🙇 인사. 지나쳐 갈 때까지 안 하면 어색해진다(HP).
 * - 견장 3줄 선배 → 🫡 경례. **내가 먼저** 해야 한다 — 선배가 데드라인 지점을
 *   넘어설 때까지 경례하지 않으면 그 자리에서 끝. 데드라인은 일차가 오를수록
 *   멀어져(빨라져), 나중에는 저 멀리서 견장을 알아보고 미리 경례해야 한다.
 *
 * 견장은 캐릭터 이미지가 아니라 코드로 그린다(Characters.ts) — 개수가 틀릴 일이 없고
 * 멀리서도 읽히도록 크게 그린다.
 */
export class HallwayScene extends BaseMainScene {
  private visitor: Visitor | null = null;
  private elapsedMs = 0;
  private cleared = 0;
  private spawned = 0;
  private target = 5;
  private approachMs = 3000;
  private saluteDeadline = 0.6;

  private countText!: TextChip;
  private judgeText!: Phaser.GameObjects.Text;
  /** 선배 경례 데드라인 표시선 */
  private deadlineG!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'hallway' });
  }

  create(): void {
    this.visitor = null;
    this.elapsedMs = 0;
    this.cleared = 0;
    this.spawned = 0;

    addSceneBg(this, 'bg_hallway');

    this.deadlineG = this.add.graphics().setDepth(4);
    this.countText = textChip(this, GAME_WIDTH / 2, 90, '0 / 0', { fontSize: 38, depth: 10 });

    this.judgeText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 320, '', {
        fontFamily: FONT,
        fontSize: '46px',
        color: COLORS.safeCss,
        stroke: '#000000',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setAlpha(0);

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
        '견장 1·2줄 → 🙇 인사 / 3줄 → 🫡 경례\n선배는 빨간 선을 넘기 전에 내가 먼저 경례해야 한다',
        {
          fontFamily: FONT,
          fontSize: '23px',
          color: COLORS.inkCss,
          align: 'center',
          lineSpacing: 6,
          stroke: '#ffffff',
          strokeThickness: 5,
        }
      )
      .setOrigin(0.5);

    this.setupCommon();
    this.target = Q2_HALLWAY.targetCount(this.day);
    this.approachMs = Q2_HALLWAY.approachMs(this.day);
    this.saluteDeadline = Q2_HALLWAY.saluteDeadline(this.day);
    this.updateCount();
    this.drawDeadline();

    this.time.delayedCall(500, () => this.spawnNext());
  }

  private updateCount(): void {
    this.countText.setText(`${this.cleared} / ${this.target}`);
  }

  /** 선배 경례 데드라인을 바닥에 그어 둔다 — 이 선을 넘기 전에 경례해야 한다 */
  private drawDeadline(): void {
    const y = floorY(this.saluteDeadline);
    this.deadlineG.clear();
    this.deadlineG.lineStyle(5, COLORS.accent, 0.5);
    // 원근에 맞춰 복도 폭만큼만 (좌우 벽 사이)
    const half = (wallX(this.saluteDeadline, 1) - wallX(this.saluteDeadline, -1)) / 2;
    this.deadlineG.lineBetween(VANISH_X - half * 0.75, y, VANISH_X + half * 0.75, y);
  }

  private pickKind(): VisitorKind {
    const seniorP = Q2_HALLWAY.seniorShare(this.day);
    const roll = Math.random();
    if (roll < seniorP) return 'senior';
    if (roll < seniorP + Q2_HALLWAY.peerShare) return 'peer';
    return 'junior';
  }

  // ── 등장 ─────────────────────────────────────

  private spawnNext(): void {
    if (this.finished || this.visitor || this.spawned >= this.target + 3) return;
    const kind = this.pickKind();
    const side: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
    const fromK = DOOR_DEPTHS[Math.floor(Math.random() * DOOR_DEPTHS.length)] ?? 0.2;

    const cadet = new Cadet(this, wallX(fromK, side), 0, kind, false, {
      visitorRank: RANK_OF[kind],
    });
    cadet.setDepth(5);
    cadet.setMotion('walk');
    this.place(cadet, fromK, wallX(fromK, side));

    // 걷는 시간에 ±15% 흔들림 — 매번 같은 속도로 오면 몸이 외워버린다
    const travelMs = this.approachMs * (0.85 + Math.random() * 0.3);
    this.visitor = {
      cadet,
      kind,
      side,
      fromK,
      startedAtMs: this.elapsedMs,
      travelMs,
      resolved: false,
    };
    audio.door();
    this.spawned += 1;
  }

  /** 깊이 k와 x를 받아 발끝이 바닥에 닿도록 배치 */
  private place(cadet: Cadet, k: number, x: number): void {
    const feet = floorY(k);
    const s = heightAt(feet) / 300;
    cadet.setScale(s).setPosition(x, feet - 120 * s);
  }

  /** 지금 이 사람이 복도의 어디까지 왔는지 (0=저 끝, 1=코앞) */
  private progressK(v: Visitor): number {
    const u = Phaser.Math.Clamp((this.elapsedMs - v.startedAtMs) / v.travelMs, 0, 1);
    return Phaser.Math.Linear(v.fromK, ARRIVE_K, u);
  }

  // ── 판정 ─────────────────────────────────────

  private press(action: Action): void {
    if (this.finished) return;
    const v = this.visitor;
    if (!v || v.resolved) return;
    const correct: Action = v.kind === 'senior' ? 'salute' : 'greet';

    if (action !== correct) {
      v.resolved = true;
      if (v.kind === 'senior') {
        v.cadet.setMotion('idle');
        this.failCaught(v.cadet, '3학년 선배를 고개 까딱으로 받아버렸다...', '너 지금 뭐 했냐?');
        return;
      }
      this.flashJudge('실수!', COLORS.accentCss);
      speechBubble(this, v.cadet.x, v.cadet.y - 170, '풉 ㅋㅋ 왜 경례함?', 800);
      this.applyDamage(
        v.kind === 'peer' ? Q2_HALLWAY.hpSalutePeer : Q2_HALLWAY.hpSaluteJunior,
        v.kind === 'peer' ? '동기한테 경례해버렸다... 개쪽팔림' : '후배한테 경례로 받아버렸다...'
      );
      this.retire(v);
      return;
    }

    // 정답 — 선배는 얼마나 미리 했는지로 등급이 갈린다
    v.resolved = true;
    const k = this.progressK(v);
    if (v.kind === 'senior') {
      const margin = (this.saluteDeadline - k) / this.saluteDeadline;
      this.flashJudge(margin > 0.35 ? '군기 좋다!' : '아슬아슬!', margin > 0.35 ? COLORS.safeCss : COLORS.warnCss);
      speechBubble(this, v.cadet.x, v.cadet.y - 170, '음, 됐다.', 700);
    } else {
      this.flashJudge('좋아!', COLORS.safeCss);
    }
    audio.chime();
    this.cleared += 1;
    this.updateCount();
    this.retire(v);

    if (this.cleared >= this.target) {
      this.succeed('복도를 무사히 통과했다!');
    }
  }

  /** 처리가 끝난 사람은 나를 지나쳐 화면 밖으로 걸어 나간다 */
  private retire(v: Visitor): void {
    this.visitor = null;
    this.tweens.add({
      targets: v.cadet,
      y: v.cadet.y + 300,
      alpha: 0,
      duration: 420,
      onComplete: () => v.cadet.destroy(),
    });
    if (this.finished || this.cleared >= this.target) return;
    this.time.delayedCall(Q2_HALLWAY.gapMs(this.day), () => this.spawnNext());
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
    const v = this.visitor;
    if (!v || v.resolved) return;

    const k = this.progressK(v);
    // 문 앞에서 출발해 복도 한가운데로 합류하며 다가온다
    const u = (k - v.fromK) / (ARRIVE_K - v.fromK);
    const x = Phaser.Math.Linear(
      wallX(k, v.side),
      VANISH_X + v.side * 50,
      Math.min(1, Math.max(0, u) * 1.5)
    );
    this.place(v.cadet, k, x);

    // 선배는 데드라인을 넘어서는 순간 끝 — 내가 먼저 경례했어야 했다
    if (v.kind === 'senior' && k >= this.saluteDeadline) {
      v.resolved = true;
      v.cadet.setMotion('idle');
      this.failCaught(
        v.cadet,
        '선배가 코앞에 올 때까지 경례를 안 했다... 후배가 먼저 하는 거다.',
        '너 나 못 봤냐?'
      );
      return;
    }
    // 후배·동기는 지나쳐 가면 어색해질 뿐
    if (v.kind !== 'senior' && k >= Q2_HALLWAY.greetDeadline) {
      v.resolved = true;
      this.applyDamage(Q2_HALLWAY.hpMiss, '그냥 지나쳐버렸다... 어색해졌다');
      this.retire(v);
    }
  }
}

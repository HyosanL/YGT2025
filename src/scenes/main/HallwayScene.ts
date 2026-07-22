import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q2_HALLWAY } from '../../config';
import { audio } from '../../core/AudioManager';
import { Button, showToast, textChip, type TextChip } from '../../ui/Button';
import { gameState } from '../../core/GameState';
import { Cadet, speechBubble } from '../../ui/Characters';
import { addSceneBg } from '../../ui/Scenery';
import { BaseMainScene } from './BaseMainScene';

type VisitorKind = 'junior' | 'peer' | 'senior';
type Action = 'greet' | 'salute';

const RANK_OF: Record<VisitorKind, 1 | 2 | 3> = { junior: 1, peer: 2, senior: 3 };

// ── 복도 원근 (bg_hallway2, 원본 864×1184 — doors.json 실측) ────────────
/**
 * 1점 투시 복도. 소실점·문 사각은 재렌더 배경에서 실측한 **원본 픽셀** 값이고,
 * create()에서 cover 스케일을 반영해 화면 좌표(아래 let들)로 변환한다.
 *
 * 바닥 위의 한 점은 k로 나타낸다: k=0이 소실점(복도 저 끝), k=1이 화면 맨 아래(코앞).
 * 화면 좌표·크기는 전부 k 하나에서 나오므로 발이 바닥에서 뜨지 않는다.
 */
const HALL_SRC = { w: 864, h: 1184, cx: 432, cy: 592, vanish: { x: 424, y: 556 } } as const;
/** 벽 밑단 직선의 기울기 (src px, 근경 문 L1/R1 밑단 실측으로 피팅) */
const WALL_SLOPE_L = (221 - 424) / (825 - 556);
const WALL_SLOPE_R = (641 - 424) / (822 - 556);
/**
 * 사람이 나오는 문 — 배경에 실제로 그려진 문 8개 중 **먼 문 6개**만 쓴다
 * (스폰을 더 멀리 보내달라는 피드백 — 근경 L1/R1 쌍은 스폰에 쓰지 않는다).
 * rect = 닫힌 문 실측 사각, ov = 열림 오버레이(PNG)의 배치 좌표. 전부 src px.
 */
const HALL_DOORS = [
  { key: 'door_L2_open', side: -1, rect: { x: 311, y: 472, w: 17, h: 218 }, ov: { x: 313, y: 474 } },
  { key: 'door_L3_open', side: -1, rect: { x: 351, y: 499, w: 10, h: 141 }, ov: { x: 353, y: 501 } },
  { key: 'door_L4_open', side: -1, rect: { x: 373, y: 511, w: 9, h: 101 }, ov: { x: 375, y: 513 } },
  { key: 'door_R2_open', side: 1, rect: { x: 534, y: 474, w: 15, h: 223 }, ov: { x: 536, y: 476 } },
  { key: 'door_R3_open', side: 1, rect: { x: 497, y: 500, w: 12, h: 152 }, ov: { x: 499, y: 502 } },
  { key: 'door_R4_open', side: 1, rect: { x: 480, y: 512, w: 8, h: 108 }, ov: { x: 482, y: 514 } },
] as const;
type HallDoor = (typeof HALL_DOORS)[number];

// create()에서 배경 매핑으로 채워지는 화면 좌표 원근 상수
let VANISH_X = GAME_WIDTH / 2;
let VANISH_Y = GAME_HEIGHT * 0.47;
let NEAR_WALL_L = -194;
let NEAR_WALL_R = 900;

const floorY = (k: number): number => VANISH_Y + (GAME_HEIGHT - VANISH_Y) * k;
const wallX = (k: number, side: -1 | 1): number =>
  VANISH_X + k * ((side === -1 ? NEAR_WALL_L : NEAR_WALL_R) - VANISH_X);

/**
 * 바닥 깊이에 따른 사람의 화면상 키 = 실제 사람 크기.
 * 계수 1.32는 배경 속 문 높이(실측 419px ≈ 사람 키의 1.18배)로 캘리브레이션했다.
 */
const heightAt = (feetYPx: number): number => Math.max(40, (feetYPx - VANISH_Y) * 1.32);
/** 내 앞에 서는 지점 (조작 버튼 위) */
const ARRIVE_K = 0.7;
/** 후배가 경례를 올리는 시점 (여정 비율) — 문에서 나오자마자 절도 있게 올린다 */
const JUNIOR_SALUTE_U = 0.28;

interface Visitor {
  cadet: Cadet;
  kind: VisitorKind;
  side: -1 | 1;
  fromK: number;
  /** 문에서 나와 몸을 돌리고 **복도를 따라 걷기 시작한** 시각 */
  startedAtMs: number;
  /** 걸어오는 데 걸리는 시간 */
  travelMs: number;
  resolved: boolean;
  /** 후배가 이미 경례를 올렸는지 */
  saluted: boolean;
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
  private comboText!: Phaser.GameObjects.Text;
  /** 연속 정응대 콤보 — 리듬을 만드는 보상 */
  private combo = 0;
  /** 선배 경례 데드라인 표시선 */
  private deadlineG!: Phaser.GameObjects.Graphics;
  /** 배경 실측 좌표 → 화면 좌표 매핑 (create에서 세팅) */
  private mapX: (px: number) => number = (px) => px;
  private mapY: (py: number) => number = (py) => py;
  private bgScale = 1;

  constructor() {
    super({ key: 'hallway' });
  }

  /** 복도는 HP를 쓰지 않는다 — 실수의 대가는 하트로만 치른다 */
  protected override usesHp(): boolean {
    return false;
  }

  create(): void {
    this.visitor = null;
    this.elapsedMs = 0;
    this.cleared = 0;
    this.spawned = 0;
    this.combo = 0;

    // 재렌더 복도 배경 — 문이 실제로 그려져 있고, 소실점·문 위치를 실측값으로 매핑한다
    const bg = addSceneBg(this, 'bg_hallway2');
    const s = bg.scaleX;
    this.bgScale = s;
    this.mapX = (px: number): number => bg.x + (px - HALL_SRC.cx) * s;
    this.mapY = (py: number): number => bg.y + (py - HALL_SRC.cy) * s;
    VANISH_X = this.mapX(HALL_SRC.vanish.x);
    VANISH_Y = this.mapY(HALL_SRC.vanish.y);
    // 벽 밑단 직선을 화면 맨 아래(k=1)까지 연장해 좌우 벽 x를 구한다
    const srcYBottom = HALL_SRC.cy + (GAME_HEIGHT - bg.y) / s;
    NEAR_WALL_L = this.mapX(HALL_SRC.vanish.x + WALL_SLOPE_L * (srcYBottom - HALL_SRC.vanish.y));
    NEAR_WALL_R = this.mapX(HALL_SRC.vanish.x + WALL_SLOPE_R * (srcYBottom - HALL_SRC.vanish.y));

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

    this.comboText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 262, '', {
        fontFamily: FONT,
        fontSize: '32px',
        color: COLORS.warnCss,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(30);

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

    this.time.delayedCall(500, () => this.spawnNext());
  }

  private updateCount(): void {
    this.countText.setText(`${this.cleared} / ${this.target}`);
  }

  /**
   * 선배 경례 데드라인을 바닥에 그어 둔다.
   * 데드라인은 '문에서 내 앞까지'의 비율이라 사람마다 출발 문이 다르면 선 위치도 달라진다 —
   * 그래서 지금 오고 있는 사람 기준으로 매 프레임 다시 긋는다.
   */
  private drawDeadline(v: Visitor | null): void {
    this.deadlineG.clear();
    if (!v || v.resolved) return;
    const k = Phaser.Math.Linear(v.fromK, ARRIVE_K, this.saluteDeadline);
    const y = floorY(k);
    this.deadlineG.lineStyle(5, COLORS.accent, 0.45);
    const half = (wallX(k, 1) - wallX(k, -1)) / 2;
    this.deadlineG.lineBetween(VANISH_X - half * 0.7, y, VANISH_X + half * 0.7, y);
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
    // 배경에 실제로 그려진 먼 문들 중 하나에서 나온다
    const door = HALL_DOORS[Math.floor(Math.random() * HALL_DOORS.length)] ?? HALL_DOORS[0]!;
    const side = door.side as -1 | 1;
    const doorBottomY = this.mapY(door.rect.y + door.rect.h);
    const fromK = Phaser.Math.Clamp(
      (doorBottomY - VANISH_Y) / (GAME_HEIGHT - VANISH_Y),
      0.05,
      0.9
    );

    const doorX = this.mapX(door.rect.x + door.rect.w / 2);
    const cadet = new Cadet(this, doorX, 0, kind, false, { visitorRank: RANK_OF[kind] });
    cadet.setDepth(5);
    cadet.setMotion('walk');
    this.place(cadet, fromK, doorX);

    // 그 문이 실제로 열렸다 닫힌다 (배경과 픽셀 정합된 오버레이)
    this.openDoorFx(door);

    // 걷는 시간에 ±15% 흔들림 — 매번 같은 속도로 오면 몸이 외워버린다
    const travelMs = this.approachMs * (0.85 + Math.random() * 0.3);
    this.visitor = {
      cadet,
      kind,
      side,
      fromK,
      // 문에서 복도 한가운데로 나와 몸을 돌리는 동안은 아직 다가오지 않는다
      startedAtMs: this.elapsedMs + Q2_HALLWAY.stepOutMs,
      travelMs,
      resolved: false,
      saluted: false,
    };
    // 복도 가운데로 걸어 나오는 한 걸음
    this.tweens.add({
      targets: cadet,
      x: Phaser.Math.Linear(doorX, VANISH_X, 0.45),
      duration: Q2_HALLWAY.stepOutMs,
      ease: 'Sine.easeOut',
    });
    this.spawned += 1;
  }

  /**
   * 배경에 그려진 바로 그 문이 열렸다 닫힌다 — 문 사각과 픽셀 정합된
   * 열림 오버레이(어두운 실내) 이미지를 얹었다 거둔다.
   * (코드로 그린 문짝을 배경 위에 겹치는 방식은 폐기 — 유저 피드백)
   */
  private openDoorFx(door: HallDoor): void {
    const img = this.add
      .image(this.mapX(door.ov.x), this.mapY(door.ov.y), door.key)
      .setOrigin(0, 0)
      .setScale(this.bgScale)
      .setDepth(4)
      .setAlpha(0);
    this.tweens.chain({
      targets: img,
      tweens: [
        { alpha: 1, duration: 140, ease: 'Cubic.easeOut' },
        { alpha: 0, delay: Q2_HALLWAY.stepOutMs + 320, duration: 240, ease: 'Cubic.easeIn' },
      ],
      onComplete: () => img.destroy(),
    });
    audio.door();
  }

  /** 깊이 k와 x를 받아 발끝이 바닥에 닿도록 배치 */
  private place(cadet: Cadet, k: number, x: number): void {
    const feet = floorY(k);
    const s = heightAt(feet) / 300;
    cadet.setScale(s).setPosition(x, feet - 120 * s);
  }

  /** 걸어온 여정의 진행률 (0=문 앞, 1=내 앞 도착) */
  private progressU(v: Visitor): number {
    return Phaser.Math.Clamp((this.elapsedMs - v.startedAtMs) / v.travelMs, 0, 1);
  }

  /** 지금 이 사람이 복도의 어디쯤인지 (0=소실점, 1=화면 맨 아래) */
  private progressK(v: Visitor): number {
    return Phaser.Math.Linear(v.fromK, ARRIVE_K, this.progressU(v));
  }

  // ── 판정 ─────────────────────────────────────

  private press(action: Action): void {
    if (this.finished) return;
    const v = this.visitor;
    if (!v || v.resolved) return;

    // 후배가 아직 경례를 안 올렸는데 내가 먼저 굽신거리면 그게 더 쪽팔린다.
    // (선배는 반대로 내가 먼저 해야 하므로 이 규칙에서 제외)
    if (v.kind === 'junior' && !v.saluted) {
      v.resolved = true;
      this.resetCombo();
      this.flashJudge('너무 빨라!', COLORS.warnCss);
      speechBubble(this, v.cadet.x, v.cadet.y - 170, '(어...?)', 800);
      this.loseHeart('후배가 경례하기도 전에 먼저 받아버렸다... 쪽팔림');
      this.retire(v);
      return;
    }

    const correct: Action = v.kind === 'senior' ? 'salute' : 'greet';

    if (action !== correct) {
      v.resolved = true;
      if (v.kind === 'senior') {
        v.cadet.setMotion('idle');
        this.failCaught(v.cadet, '3학년 선배를 고개 까딱으로 받아버렸다...', '너 지금 뭐 했냐?');
        return;
      }
      this.resetCombo();
      this.flashJudge('실수!', COLORS.accentCss);
      speechBubble(this, v.cadet.x, v.cadet.y - 170, '풉 ㅋㅋ 왜 경례함?', 800);
      this.loseHeart(
        v.kind === 'peer' ? '동기한테 경례해버렸다... 개쪽팔림' : '후배한테 경례로 받아버렸다...'
      );
      this.retire(v);
      return;
    }

    // 정답 — 선배는 얼마나 미리 했는지로 등급이 갈린다
    v.resolved = true;
    const u = this.progressU(v);
    if (v.kind === 'senior') {
      const margin = (this.saluteDeadline - u) / Math.max(0.01, this.saluteDeadline);
      this.flashJudge(margin > 0.35 ? '군기 좋다!' : '아슬아슬!', margin > 0.35 ? COLORS.safeCss : COLORS.warnCss);
      speechBubble(this, v.cadet.x, v.cadet.y - 170, '음, 됐다.', 700);
    } else {
      this.flashJudge('좋아!', COLORS.safeCss);
    }
    audio.chime();
    this.cleared += 1;
    this.bumpCombo();
    this.updateCount();
    this.retire(v);

    if (this.cleared >= this.target) {
      this.succeed('복도를 무사히 통과했다!');
    }
  }

  /** 연속 정응대 — 콤보가 쌓일수록 판이 리드미컬해진다 */
  private bumpCombo(): void {
    this.combo += 1;
    if (this.combo < 2) return;
    this.comboText.setText(`🔥 ${this.combo} 콤보!`).setScale(1.25);
    this.tweens.add({ targets: this.comboText, scale: 1, duration: 130 });
  }

  private resetCombo(): void {
    this.combo = 0;
    this.comboText.setText('');
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
    // 스폰 예산(target+3)을 다 썼는데 목표 미달 — 더 올 사람이 없어 판이 영원히
    // 멈추는 소프트락이 되므로, 실수 누적 실패로 그 자리에서 종결한다
    if (this.spawned >= this.target + 3) {
      this.time.delayedCall(600, () =>
        this.fail('실수가 너무 잦았다... 복도에 소문이 파다하게 퍼졌다.')
      );
      return;
    }
    this.time.delayedCall(Q2_HALLWAY.gapMs(this.day), () => this.spawnNext());
  }

  /** 복도 퀘스트의 대가는 HP가 아니라 하트다 (약 1/3칸) */
  private loseHeart(reason: string): void {
    if (this.finished) return;
    audio.buzz();
    showToast(this, reason);
    this.cameras.main.shake(180, 0.005);
    const alive = gameState.practiceMode
      ? true
      : gameState.deductLifeUnits(Q2_HALLWAY.missLifeUnits);
    if (!alive) this.fail('실수가 쌓여 목숨이 바닥났다...');
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
    this.drawDeadline(v);
    if (!v || v.resolved) return;

    if (this.elapsedMs < v.startedAtMs) return; // 아직 문 앞에서 나오는 중
    const u = this.progressU(v);
    const k = this.progressK(v);
    // 문 앞에서 복도 한가운데로 합류하며 다가온다
    const x = Phaser.Math.Linear(wallX(k, v.side), VANISH_X + v.side * 40, Math.min(1, u * 1.6));
    this.place(v.cadet, k, x);

    // 후배는 여정의 절반쯤에서 **먼저** 절도 있게 경례한다 —
    // 내가 그걸 보고 인사로 받아줄 시간이 남아야 하므로 일찍 올린다.
    if (v.kind === 'junior' && u >= JUNIOR_SALUTE_U && !v.saluted) {
      v.saluted = true;
      v.cadet.setMotion('salute');
      audio.tick();
    }

    // 선배는 데드라인을 넘어서는 순간 끝 — 내가 먼저 경례했어야 했다
    if (v.kind === 'senior' && u >= this.saluteDeadline) {
      v.resolved = true;
      v.cadet.setMotion('idle');
      this.failCaught(
        v.cadet,
        '선배가 코앞에 올 때까지 경례를 안 했다... 후배가 먼저 하는 거다.',
        '너 나 못 봤냐?'
      );
      return;
    }
    // 후배·동기는 내 앞에 다 와서까지 응대를 안 하면 어색해진다
    if (v.kind !== 'senior' && u >= 1) {
      v.resolved = true;
      this.resetCombo();
      this.flashJudge('놓쳤다!', COLORS.accentCss);
      this.loseHeart('제때 응대하지 못했다... 어색해졌다');
      this.retire(v);
    }
  }
}

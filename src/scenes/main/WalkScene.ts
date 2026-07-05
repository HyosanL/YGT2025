import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q4_WALK } from '../../config';
import { gameState } from '../../core/GameState';
import { Cadet } from '../../ui/Characters';
import { chance, randFloat } from '../../utils/rng';
import { BaseMainScene } from './BaseMainScene';

const ROAD_L = 110;
const ROAD_R = 610;
const PLAYER_X = (ROAD_L + ROAD_R) / 2;
const PLAYER_Y = 960;
// 선배는 길가 잔디에 멀찍이 서 있다 — 측면 거리(~300px) 덕에 시야 끝자락만 도로에 닿는다
const GUARD_LEFT_X = 58;
const GUARD_RIGHT_X = GAME_WIDTH - 58;

interface Guard {
  cadet: Cadet;
  worldY: number;
  x: number;
  /** 시선 기준 각 (도로 중앙을 향함) */
  baseAngle: number;
  /** 현재 시선 각 */
  gaze: number;
  /** 지금 회전해 가고 있는 목표 각 */
  targetGaze: number;
  /** 회전 속도 (rad/ms) — 스냅 턴이면 몇 배로 빨라진다 */
  turnSpeed: number;
  /** 다음 방향 전환 시각 (elapsedMs 기준) */
  nextThinkMs: number;
}

/**
 * Q4. 태권도장까지 가기 — 탑다운 잠입.
 * 길가에 늘어선 선배들의 시선이 CCTV처럼 회전하되 '변칙적'이다:
 * 수시로 새 목표각을 골라 돌아보고, 가끔은 몇 배속으로 홱 돌아본다 (일차↑ = 더 빠르고 잦게).
 * 시야(부채꼴)에 걸린 채 '걷고' 있으면 유예(graceMs) 후 발각 — 구보 중이면 안전.
 * 구보는 HP를 태우고, 사각지대 걷기는 HP를 회복한다. 관리 실패 = 탈진.
 */
export class WalkScene extends BaseMainScene {
  private progressPx = 0;
  private distancePx = 1;
  private elapsedMs = 0;
  private holding = false;
  private spottedMs = 0;
  private graceMs = 500;
  /** 미니퀘스트/일시정지 복귀 직후 잠깐의 판정 면제 */
  private spotSafeUntilMs = 0;
  private dangerOn = false;

  private guards: Guard[] = [];
  private player!: Cadet;
  private coneG!: Phaser.GameObjects.Graphics;
  private progressFill!: Phaser.GameObjects.Graphics;
  private stateText!: Phaser.GameObjects.Text;
  private alertText!: Phaser.GameObjects.Text;
  private dashes: Phaser.GameObjects.Rectangle[] = [];
  private sideDecor: Phaser.GameObjects.Container[] = [];
  private dojang!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'walk' });
  }

  create(): void {
    this.progressPx = 0;
    this.elapsedMs = 0;
    this.holding = false;
    this.spottedMs = 0;
    this.spotSafeUntilMs = 0;
    this.dangerOn = false;
    this.distancePx = Q4_WALK.distancePx(gameState.day);
    this.graceMs = Q4_WALK.graceMs(gameState.day);

    // ── 탑다운 배경: 잔디 → 인도 → 도로 ──
    const bg = this.add.graphics();
    // 양옆 잔디
    bg.fillGradientStyle(0x3f7d4e, 0x3f7d4e, 0x35693f, 0x35693f, 1);
    bg.fillRect(0, 0, ROAD_L - 34, GAME_HEIGHT);
    bg.fillRect(ROAD_R + 34, 0, GAME_WIDTH - ROAD_R - 34, GAME_HEIGHT);
    // 인도 (연석)
    bg.fillStyle(0xb9b2a0, 1);
    bg.fillRect(ROAD_L - 34, 0, 34, GAME_HEIGHT);
    bg.fillRect(ROAD_R, 0, 34, GAME_HEIGHT);
    // 아스팔트
    bg.fillGradientStyle(0x4a4d60, 0x4a4d60, 0x424556, 0x424556, 1);
    bg.fillRect(ROAD_L, 0, ROAD_R - ROAD_L, GAME_HEIGHT);
    // 도로 가장자리 실선
    bg.fillStyle(0xe8e4d8, 0.75);
    bg.fillRect(ROAD_L + 8, 0, 6, GAME_HEIGHT);
    bg.fillRect(ROAD_R - 14, 0, 6, GAME_HEIGHT);

    // 중앙 점선 (스크롤 연출)
    this.dashes = [];
    for (let i = 0; i < 11; i++) {
      const d = this.add.rectangle(PLAYER_X, 0, 12, 66, 0xf5f5f5, 0.45).setDepth(1);
      this.dashes.push(d);
    }

    // 길가 장식 (수풀) — 가장자리로 바짝 붙여 선배 자리와 겹치지 않게
    this.sideDecor = [];
    for (let i = 0; i < 8; i++) {
      const c = this.add.container(0, 0).setDepth(1);
      const g = this.add.graphics();
      const leftSide = i % 2 === 0;
      const bx = leftSide ? 22 : GAME_WIDTH - 22;
      g.fillStyle(0x2e5e3e, 1);
      g.fillCircle(0, 0, 26);
      g.fillCircle(-16, 12, 18);
      g.fillCircle(18, 10, 20);
      g.fillStyle(0x4e8d55, 1);
      g.fillCircle(4, -6, 15);
      c.add(g);
      c.setX(bx + randFloat(-8, 8));
      this.sideDecor.push(c);
    }

    // 시야 부채꼴 레이어 (캐릭터 아래)
    this.coneG = this.add.graphics().setDepth(3);

    // 골인 지점 — 태권도장 (마지막에 스크롤되어 내려온다)
    this.dojang = this.add.container(PLAYER_X, -9999).setDepth(5);
    const dg = this.add.graphics();
    dg.fillStyle(0x8a4a3c, 1);
    dg.fillRoundedRect(-190, -90, 380, 150, 14);
    dg.fillStyle(0x5c2f28, 1);
    dg.fillRect(-210, -110, 420, 34);
    dg.fillStyle(0xf5ecd8, 1);
    dg.fillRoundedRect(-120, -46, 240, 72, 10);
    this.dojang.add(dg);
    this.dojang.add(
      this.add
        .text(0, -10, '🥋 태권도장', {
          fontFamily: FONT,
          fontSize: '36px',
          color: '#5c2f28',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
    );

    // ── 도로변 선배 배치 — 불규칙 간격 + 시야가 교차하는 구간 포함 ──
    this.guards = [];
    const spacing = Q4_WALK.seniorSpacingPx(gameState.day);
    const ampRad = Phaser.Math.DegToRad(Q4_WALK.vision.ampDeg);
    const addGuard = (wy: number, side: 1 | -1): void => {
      const gx = (side === 1 ? GUARD_RIGHT_X : GUARD_LEFT_X) + randFloat(-18, 18);
      const cadet = new Cadet(this, gx, -400, 'senior');
      cadet.setScale(0.85).setDepth(6);
      cadet.setFace('👀');
      const baseAngle = side === 1 ? Math.PI : 0; // 도로 중앙을 향해
      this.guards.push({
        cadet,
        worldY: wy,
        x: gx,
        baseAngle,
        gaze: baseAngle + randFloat(-ampRad, ampRad),
        targetGaze: baseAngle + randFloat(-ampRad, ampRad),
        turnSpeed: 0.0001,
        nextThinkMs: randFloat(0, 700), // 선배마다 다른 타이밍에 첫 방향 전환
      });
    };
    // 도착 지점(무도장 입구)까지 빈 구간 없이 깔린다
    let wy = 1150;
    while (wy < this.distancePx + 120) {
      const side: 1 | -1 = chance(0.5) ? 1 : -1; // 완전 무작위 — 같은 쪽 연속도 흔하다
      addGuard(wy, side);
      // 가끔 맞은편에 한 명 더 — 양쪽 시야가 겹치는 협곡 구간
      if (chance(Q4_WALK.pairChance)) {
        addGuard(wy + randFloat(-120, 200), (side === 1 ? -1 : 1) as 1 | -1);
      }
      wy += spacing + randFloat(-330, 330);
    }

    // ── HUD ──
    const barBg = this.add.graphics();
    barBg.fillStyle(0x000000, 0.55);
    barBg.fillRoundedRect(GAME_WIDTH / 2 - 220, 80, 440, 40, 10);
    barBg.setDepth(10);
    this.progressFill = this.add.graphics().setDepth(10);
    this.add
      .text(GAME_WIDTH / 2, 100, '도착까지', {
        fontFamily: FONT,
        fontSize: '24px',
        color: COLORS.textCss,
      })
      .setOrigin(0.5)
      .setDepth(11);

    this.player = new Cadet(this, PLAYER_X, PLAYER_Y, 'player');
    this.player.setDepth(7);
    this.player.setMotion('walk');

    this.alertText = this.add
      .text(PLAYER_X, PLAYER_Y - 190, '❗ 시야에 걸렸다 — 뛰어!!', {
        fontFamily: FONT,
        fontSize: '34px',
        color: COLORS.accentCss,
        fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);

    this.stateText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 120, '', {
        fontFamily: FONT,
        fontSize: '30px',
        color: COLORS.textCss,
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: { x: 20, y: 12 },
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 56, '시야에 걸리면 구보 필수 · 사각지대에선 걸어서 HP 회복', {
        fontFamily: FONT,
        fontSize: '22px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5)
      .setDepth(20);

    // 구보 중 발밑 흙먼지
    this.time.addEvent({
      delay: 120,
      loop: true,
      callback: () => {
        if (!this.holding || this.finished) return;
        const puff = this.add.circle(
          this.player.x + Phaser.Math.Between(-26, 26),
          this.player.y + 96,
          Phaser.Math.Between(5, 10),
          0xd9cfc0,
          0.35
        );
        puff.setDepth(6);
        this.tweens.add({
          targets: puff,
          y: puff.y + 20,
          scale: 1.9,
          alpha: 0,
          duration: 380,
          onComplete: () => puff.destroy(),
        });
      },
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < 110) return; // 상단 UI(일시정지/음소거) 영역
      this.holding = true;
    });
    this.input.on('pointerup', () => {
      this.holding = false;
    });
    // 미니퀘스트/일시정지 pause 중 pointerup이 유실되면 홀드가 고착된다 — pause 시 강제 해제
    this.events.on(Phaser.Scenes.Events.PAUSE, () => {
      this.holding = false;
    });
    // 복귀 직후 짧은 판정 면제 — 눈 뜨자마자 시야 정중앙이어도 대응할 시간을 준다
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.spottedMs = 0;
      this.spotSafeUntilMs = this.elapsedMs + 600;
    });

    this.setupCommon();
  }

  protected tick(delta: number): void {
    this.elapsedMs += delta;

    // ── 이동 & HP ──
    const speed = this.holding ? Q4_WALK.runSpeed : Q4_WALK.walkSpeed;
    this.progressPx += (speed * delta) / 1000;
    if (this.holding) {
      if (gameState.damage((Q4_WALK.runHpPerSec * delta) / 1000)) {
        this.fail('무리한 구보로 탈진해서 쓰러졌다...');
        return;
      }
    } else {
      gameState.heal((Q4_WALK.walkRegenPerSec * delta) / 1000);
    }

    if (this.progressPx >= this.distancePx) {
      this.succeed('선배들의 시선을 뚫고 태권도장에 도착했다!');
      return;
    }

    // ── 스크롤 비주얼 ──
    const dashSpan = 150;
    const dashOff = this.progressPx % dashSpan;
    this.dashes.forEach((d, i) => {
      d.y = (i - 1) * dashSpan + dashOff;
    });
    const decorSpan = 460;
    const decorTotal = decorSpan * this.sideDecor.length;
    this.sideDecor.forEach((c, i) => {
      const raw = (i * decorSpan + this.progressPx) % decorTotal;
      c.setY(raw - decorSpan / 2);
    });
    this.dojang.setY(PLAYER_Y - (this.distancePx + 430 - this.progressPx));

    // ── 선배 시야 판정 (변칙 회전) ──
    const vision = Q4_WALK.vision;
    const half = Phaser.Math.DegToRad(vision.halfAngleDeg);
    const amp = Phaser.Math.DegToRad(vision.ampDeg);
    const range = vision.rangePx;
    const baseTurn = Phaser.Math.DegToRad(vision.turnDegPerSec(this.day)) / 1000; // rad/ms
    const thinkRange = vision.thinkMsRange(this.day);
    const snapP = vision.snapChance(this.day);
    let anySpot = false;
    let spotter: Cadet | null = null;
    this.coneG.clear();
    for (const g of this.guards) {
      const sy = PLAYER_Y - (g.worldY - this.progressPx);
      g.cadet.setY(sy);
      const onScreen = sy > -250 && sy < GAME_HEIGHT + 250;
      g.cadet.setVisible(onScreen);
      if (!onScreen) continue;

      // 수시로 새 목표각을 고른다 — 가끔은 몇 배속 스냅 턴으로 홱 돌아본다
      if (this.elapsedMs >= g.nextThinkMs) {
        g.nextThinkMs = this.elapsedMs + randFloat(thinkRange[0], thinkRange[1]);
        g.targetGaze = g.baseAngle + randFloat(-amp, amp);
        g.turnSpeed = baseTurn * randFloat(0.75, 1.5) * (chance(snapP) ? 3 : 1);
      }
      const diff = Phaser.Math.Angle.Wrap(g.targetGaze - g.gaze);
      const step = g.turnSpeed * delta;
      g.gaze = Math.abs(diff) <= step ? g.targetGaze : g.gaze + Math.sign(diff) * step;

      const dx = PLAYER_X - g.x;
      const dy = PLAYER_Y - sy;
      const dist = Math.hypot(dx, dy);
      const inCone =
        dist < range && Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - g.gaze)) < half;
      if (inCone) {
        anySpot = true;
        spotter = g.cadet;
      }
      g.cadet.setFace(inCone ? (this.holding ? '🫡' : '😡') : '👀');

      // 시야 부채꼴 — 평소엔 노랑, 나를 비추는 중엔 빨강
      this.coneG.fillStyle(inCone ? 0xe94560 : 0xffd166, inCone ? 0.2 : 0.11);
      this.coneG.slice(g.x, sy, range, g.gaze - half, g.gaze + half, false);
      this.coneG.fillPath();
    }

    // ── 발각 유예 판정 ──
    if (anySpot) {
      if (!this.dangerOn) {
        this.dangerOn = true;
        this.setDanger('in');
      }
      const graced = this.elapsedMs < this.spotSafeUntilMs;
      if (this.holding || graced) {
        this.spottedMs = 0;
      } else {
        this.spottedMs += delta;
        if (this.spottedMs > this.graceMs && spotter) {
          this.player.setFace('😨');
          this.failCaught(spotter, '시야에 걸린 채 걷다가 딱 걸렸다!', '야, 일로 와봐.');
          return;
        }
      }
      this.alertText.setVisible(!this.holding);
    } else {
      if (this.dangerOn) {
        this.dangerOn = false;
        this.setDanger('off');
      }
      this.spottedMs = 0;
      this.alertText.setVisible(false);
    }

    // ── HUD/연출 갱신 ──
    const ratio = Math.min(1, this.progressPx / this.distancePx);
    this.progressFill.clear();
    this.progressFill.fillStyle(COLORS.safe, 1);
    this.progressFill.fillRoundedRect(GAME_WIDTH / 2 - 214, 86, 428 * ratio, 28, 7);

    this.stateText.setText(
      this.holding ? '🏃 구보 중!! (HP 소모)' : '🚶 걷는 중 (화면을 꾹 누르면 구보 · HP 회복)'
    );
    this.stateText.setColor(this.holding ? COLORS.warnCss : COLORS.textCss);
    this.player.setFace(this.holding ? '😤' : '😏');
    this.player.setMotion(this.holding ? 'run' : 'walk');
  }
}

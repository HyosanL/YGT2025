import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q3_MICROWAVE } from '../../config';
import { audio } from '../../core/AudioManager';
import { Cadet } from '../../ui/Characters';
import { addVignette, drawAreaSign, drawSkyGradient, drawWasher } from '../../ui/Scenery';
import { chance, pick, randFloat, randRange } from '../../utils/rng';
import { BaseMainScene } from './BaseMainScene';

type Zone = 'laundry' | 'micro';

const LAUNDRY_X = 170;
const MICRO_X = 550;
const PLAYER_Y = 820;
/** 복도를 따라 선배가 갑자기 나타날 수 있는 여러 지점 */
const SENIOR_SPOTS = [150, 360, 570] as const;

/**
 * Q3. 몰래 결식하고 전자레인지 돌리기.
 * 좌(세탁실=은신처)/우(전자레인지) 터치로 이동. 전자레인지 앞에서만 게이지가 찬다.
 * 선배는 예고 없이 복도의 여러 지점 중 한 곳에 갑자기 나타난다.
 * 등장 순간의 반응 유예(reactMs) 안에 세탁실로 피하지 못하면 발각.
 * 100% 도달 시 "삐-" 소리가 나는 동안은 숨어 있어도 선배가 있으면 발각.
 */
export class MicrowaveScene extends BaseMainScene {
  private zone: Zone = 'micro';
  private seniorState: 'away' | 'in' = 'away';
  private reacted = false;
  private cookProgressMs = 0;
  private cookTotalMs = 1;
  private beeping = false;
  private beepElapsedMs = 0;
  private lightsRemainMs = 1;
  private lightsTotalMs = 1;
  private lightsLastSec = -1;

  private player!: Cadet;
  private senior!: Cadet;
  private cookFill!: Phaser.GameObjects.Graphics;
  private cookLabel!: Phaser.GameObjects.Text;
  private lightsFill!: Phaser.GameObjects.Graphics;
  private lightsLabel!: Phaser.GameObjects.Text;
  private beepText!: Phaser.GameObjects.Text;
  private preBeepText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'microwave' });
  }

  create(): void {
    this.zone = 'micro';
    this.seniorState = 'away';
    this.cookProgressMs = 0;
    this.beeping = false;
    this.beepElapsedMs = 0;
    this.lightsLastSec = -1;

    // 애니풍 심야 세탁실 + 취사구역
    drawSkyGradient(this, 0, 0, GAME_WIDTH, 260, 0x2e3448, 0x272c40);
    const bg = this.add.graphics();
    // 상단 복도 (선배가 지나다니는 어두운 띠) — 문 실루엣 3개가 등장 지점
    bg.fillGradientStyle(0x141824, 0x141824, 0x1c2130, 0x1c2130, 1);
    bg.fillRect(0, 260, GAME_WIDTH, 160);
    for (const dx of SENIOR_SPOTS) {
      bg.fillStyle(0x242a3c, 1);
      bg.fillRoundedRect(dx - 44, 272, 88, 142, 4);
      bg.lineStyle(2, 0x323a52, 1);
      bg.strokeRoundedRect(dx - 36, 280, 72, 126, 3);
    }
    // 비상구 표시등
    bg.fillStyle(0x143324, 1);
    bg.fillRoundedRect(322, 218, 76, 34, 4);
    bg.fillStyle(0x4ecca3, 0.9);
    bg.fillRoundedRect(328, 224, 64, 22, 3);
    // 복도-실내 경계 단차 + 실내 벽
    bg.fillStyle(0x101420, 1);
    bg.fillRect(0, 414, GAME_WIDTH, 10);
    bg.fillGradientStyle(0x353b52, 0x353b52, 0x2b3044, 0x2b3044, 1);
    bg.fillRect(0, 424, GAME_WIDTH, 950 - 424);
    bg.lineStyle(2, 0xffffff, 0.05);
    for (let y = 470; y < 950; y += 75) bg.lineBetween(0, y, GAME_WIDTH, y);
    // 바닥
    bg.fillGradientStyle(0x4a4a5e, 0x4a4a5e, 0x3a3a4c, 0x3a3a4c, 1);
    bg.fillRect(0, 950, GAME_WIDTH, GAME_HEIGHT - 950);
    bg.lineStyle(2, 0xffffff, 0.06);
    for (let x = 40; x < GAME_WIDTH; x += 120) bg.lineBetween(x, 950, x, GAME_HEIGHT);

    // 세탁실 (왼쪽 알코브) — 세탁기 2대 + 세제 선반
    const laundry = this.add.graphics();
    laundry.fillStyle(0x1f2a3c, 1);
    laundry.fillRoundedRect(40, 500, 270, 430, 14);
    laundry.lineStyle(3, 0x3d5a7a, 1);
    laundry.strokeRoundedRect(40, 500, 270, 430, 14);
    laundry.fillStyle(0x2c3a50, 1);
    laundry.fillRect(60, 640, 230, 8);
    const bottles: Array<[number, number]> = [
      [95, 0x4ecca3],
      [135, 0xffb400],
      [175, 0xe94560],
      [215, 0x4a90d9],
    ];
    for (const [bx, bc] of bottles) {
      laundry.fillStyle(bc, 0.9);
      laundry.fillRoundedRect(bx, 602, 26, 38, 4);
      laundry.fillStyle(0x1f2a3c, 1);
      laundry.fillRect(bx + 7, 596, 12, 8);
    }
    drawWasher(this, 115, 920, 1);
    drawWasher(this, 240, 920, 1);
    this.add.text(175, 545, '🧺 세탁실 (은신처)', {
      fontFamily: FONT,
      fontSize: '26px',
      color: COLORS.safeCss,
    }).setOrigin(0.5);

    // 취사구역 (오른쪽) — 카운터 + 전자레인지
    const counter = this.add.graphics();
    counter.fillStyle(0x6e5840, 1);
    counter.fillRect(420, 700, 280, 10);
    counter.fillStyle(0x5a4632, 1);
    counter.fillRect(420, 710, 280, 26);
    counter.fillStyle(0x3c3224, 1);
    counter.fillRect(432, 736, 256, 120);
    counter.lineStyle(2, 0x554838, 1);
    counter.strokeRect(446, 748, 108, 96);
    counter.strokeRect(566, 748, 108, 96);
    // 전자레인지 본체
    counter.fillStyle(0x3a3f4e, 1);
    counter.fillRoundedRect(450, 580, 210, 120, 10);
    counter.fillStyle(0x22252f, 1);
    counter.fillRoundedRect(462, 592, 132, 96, 6);
    counter.fillStyle(0xffb400, 0.28);
    counter.fillRoundedRect(462, 592, 132, 96, 6);
    counter.lineStyle(2, 0x555b70, 1);
    counter.strokeRoundedRect(462, 592, 132, 96, 6);
    // 컨트롤 패널 (디지털 표시 + 버튼)
    counter.fillStyle(0x2b2f3c, 1);
    counter.fillRoundedRect(602, 592, 48, 96, 4);
    counter.fillStyle(0x4ecca3, 0.9);
    counter.fillRect(608, 600, 36, 14);
    counter.fillStyle(0x555b70, 1);
    for (let i = 0; i < 3; i++) counter.fillCircle(626, 638 + i * 18, 6);
    this.add.text(530, 640, '🍜', { fontFamily: FONT, fontSize: '48px' }).setOrigin(0.5);
    drawAreaSign(this, 555, 538, '취사구역');
    // 전자레인지 위 은은한 백열등 빛
    const glow = this.add.graphics();
    glow.fillStyle(0xffe9a8, 0.06);
    glow.fillCircle(555, 580, 190);
    addVignette(this, 0.3);

    // 조리 게이지
    const barBg = this.add.graphics();
    barBg.fillStyle(0x000000, 0.55);
    barBg.fillRoundedRect(GAME_WIDTH / 2 - 250, 80, 500, 44, 10);
    this.cookFill = this.add.graphics();
    this.cookLabel = this.add
      .text(GAME_WIDTH / 2, 102, '조리 0%', {
        fontFamily: FONT,
        fontSize: '26px',
        color: COLORS.textCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(10);

    // 완전소등 카운트다운 — 이 시간 안에 "삐-"까지 끝내야 한다
    const lightsBg = this.add.graphics();
    lightsBg.fillStyle(0x000000, 0.55);
    lightsBg.fillRoundedRect(GAME_WIDTH / 2 - 250, 132, 500, 36, 10);
    this.lightsFill = this.add.graphics();
    this.lightsLabel = this.add
      .text(GAME_WIDTH / 2, 150, '', {
        fontFamily: FONT,
        fontSize: '22px',
        color: COLORS.textCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.beepText = this.add
      .text(530, 480, '삐 ─ !! (선배가 들으면 끝!)', {
        fontFamily: FONT,
        fontSize: '40px',
        color: COLORS.accentCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setVisible(false);

    // 90% 근접 시 뜨는 경고 — "삐-" 타이밍을 고르라는 안내
    this.preBeepText = this.add
      .text(GAME_WIDTH / 2, 200, '⚠️ 곧 "삐-" 완성음이 울린다! 선배가 지나간 직후에 완성시켜!', {
        fontFamily: FONT,
        fontSize: '25px',
        color: COLORS.warnCss,
        fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: { x: 16, y: 8 },
        wordWrap: { width: GAME_WIDTH - 80 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(11)
      .setVisible(false);
    this.tweens.add({
      targets: this.preBeepText,
      alpha: { from: 1, to: 0.55 },
      duration: 380,
      yoyo: true,
      repeat: -1,
    });

    this.senior = new Cadet(this, GAME_WIDTH / 2, 340, 'senior');
    this.senior.setScale(0.7).setVisible(false).setDepth(5);

    this.player = new Cadet(this, MICRO_X, PLAYER_Y, 'player');
    this.player.setFace('🤤');

    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT - 100,
        '◀ 왼쪽 터치 = 세탁실 숨기 · 오른쪽 터치 = 전자레인지 ▶\n100% 순간 "삐-"가 크게 울린다 — 그때 선배가 있으면 숨어 있어도 끝!',
        {
          fontFamily: FONT,
          fontSize: '23px',
          color: COLORS.subCss,
          wordWrap: { width: GAME_WIDTH - 50 },
          align: 'center',
          lineSpacing: 6,
        }
      )
      .setOrigin(0.5);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y < 140) return; // 상단 UI(음소거 등) 영역 무시
      this.moveTo(pointer.x < GAME_WIDTH / 2 ? 'laundry' : 'micro');
    });

    this.setupCommon();
    this.cookTotalMs = Q3_MICROWAVE.cookMs(this.day);
    this.lightsTotalMs = Q3_MICROWAVE.lightsOutMs(this.day);
    this.lightsRemainMs = this.lightsTotalMs;

    this.startSeniorLoop({
      params: () => ({
        gapMs: randRange(Q3_MICROWAVE.gapMsRange(this.day)),
        stayMs: randRange(Q3_MICROWAVE.stayMsRange(this.day)),
      }),
      onEnter: () => {
        this.seniorState = 'in';
        this.reacted = false;
        // 변칙 등장 — 대개 복도 멀리(작게), 가끔은 방 안까지 들어온다(크게)
        if (chance(0.3)) {
          this.senior.setPosition(640, randFloat(760, 810)).setScale(randFloat(0.95, 1.1));
        } else {
          this.senior
            .setPosition(pick(SENIOR_SPOTS) + randFloat(-20, 20), 340)
            .setScale(randFloat(0.55, 0.75));
        }
        this.senior.setVisible(true);
        const reactMs = Q3_MICROWAVE.reactMs(this.day);
        this.time.delayedCall(reactMs, () => {
          if (this.finished || this.seniorState !== 'in') return;
          if (this.zone === 'laundry') {
            this.reacted = true;
          } else {
            this.failCaught(this.senior, '반응이 늦었다! 전자레인지 앞에 서 있는 걸 들켰다.');
          }
        });
      },
      onLeave: () => {
        this.seniorState = 'away';
        this.senior.setVisible(false);
      },
    });
  }

  private moveTo(zone: Zone): void {
    if (this.finished || this.zone === zone) return;
    this.zone = zone;
    const x = zone === 'laundry' ? LAUNDRY_X : MICRO_X;
    this.player.setMotion('run');
    this.tweens.add({
      targets: this.player,
      x,
      duration: 180,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        if (!this.finished) this.player.setMotion('idle');
      },
    });
    this.player.setFace(zone === 'laundry' ? '🫣' : '🤤');
  }

  protected tick(delta: number): void {
    // 완전소등 카운트다운 — 0이 되기 전에 "삐-"까지 끝내야 한다
    this.lightsRemainMs -= delta;
    if (this.lightsRemainMs <= 0) {
      this.fail('완전소등 나팔이 울렸다... 라면을 두고 어둠 속에서 걸렸다.');
      return;
    }
    const lightsRatio = Math.max(0, this.lightsRemainMs / this.lightsTotalMs);
    this.lightsFill.clear();
    this.lightsFill.fillStyle(lightsRatio < 0.25 ? COLORS.accent : 0x8a7fd9, 1);
    this.lightsFill.fillRoundedRect(GAME_WIDTH / 2 - 244, 137, 488 * lightsRatio, 26, 7);
    const lightsSec = Math.ceil(this.lightsRemainMs / 1000);
    this.lightsLabel.setText(`🌙 완전소등까지 ${lightsSec}초`);
    if (this.lightsRemainMs < 5000 && lightsSec !== this.lightsLastSec) {
      this.lightsLastSec = lightsSec;
      audio.tick();
      this.cameras.main.shake(60, 0.002);
    }

    // 반응에 성공해 세탁실로 피한 뒤, 다시 전자레인지 앞으로 돌아오면 발각
    if (this.seniorState === 'in' && this.reacted && this.zone === 'micro') {
      this.failCaught(this.senior, '전자레인지 앞에 서 있는 걸 선배에게 발각됐다!');
      return;
    }

    if (this.beeping) {
      this.beepElapsedMs += delta;
      if (this.seniorState === 'in') {
        this.failCaught(this.senior, '"삐-" 소리를 들은 선배가 전자레인지를 열어봤다...');
        return;
      }
      if (this.beepElapsedMs >= Q3_MICROWAVE.beepMs) {
        this.succeed('라면 획득! 흔적도 없이 순삭했다.');
      }
      return;
    }

    // 전자레인지 앞에 있을 때만 조리 진행
    if (this.zone === 'micro') {
      this.cookProgressMs += delta;
      if (this.cookProgressMs >= this.cookTotalMs) {
        this.beeping = true;
        this.beepElapsedMs = 0;
        this.beepText.setVisible(true);
        this.tweens.add({
          targets: this.beepText,
          scale: { from: 1, to: 1.3 },
          duration: 200,
          yoyo: true,
          repeat: 4,
        });
        audio.microwaveBeep();
      }
    }

    const ratio = Math.min(1, this.cookProgressMs / this.cookTotalMs);
    this.cookFill.clear();
    this.cookFill.fillStyle(ratio > 0.9 ? COLORS.accent : COLORS.warn, 1);
    this.cookFill.fillRoundedRect(GAME_WIDTH / 2 - 244, 86, 488 * ratio, 32, 7);
    this.cookLabel.setText(`조리 ${Math.floor(ratio * 100)}%`);
    // 완성 직전 경고 — "삐-" 타이밍을 고를 수 있게 미리 알려준다
    this.preBeepText.setVisible(ratio >= 0.82 && !this.beeping);
  }
}

import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q3_MICROWAVE } from '../../config';
import { audio } from '../../core/AudioManager';
import { Button } from '../../ui/Button';
import { Cadet } from '../../ui/Characters';
import { addSceneBg, addVignette } from '../../ui/Scenery';
import { chance, randFloat } from '../../utils/rng';
import { BaseMainScene } from './BaseMainScene';

type Zone = 'laundry' | 'micro';

/**
 * 배경(bg_micro)을 화면에 얹은 뒤의 실제 좌표들.
 * 카메라 눈높이(소실점)가 HORIZON — 서 있는 사람의 머리는 거리와 무관하게 이 선 근처에 온다.
 * 그래서 가까이 있을수록 몸이 아래로 길게 뻗어 화면 밖으로 나가고(= 상반신만 보임),
 * 멀리 있을수록 작아진다. 이 규칙으로 크기를 정하면 발이 바닥에 붙는다.
 */
const HORIZON = 550;
/** 전자레인지 (배경 픽셀에서 실측한 밝은 몸체 영역의 중심) */
const OVEN_X = 461;
const OVEN_Y = 924;
/** 세탁실 문 — 중심 x, 문턱(바닥) y, 문 높이 */
const DOOR_X = 113;
const DOOR_FLOOR_Y = 1092;
const DOOR_H = 724;
/** 전자레인지 앞: 카메라 코앞이라 뒷모습 상반신만 화면에 들어온다 */
const NEAR = { x: 618, y: 1162, scale: 3.4 } as const;
/** 세탁실 문 안: 문 높이의 약 80%를 채우는 크기로 쏙 들어간다 */
const HIDE_SCALE = (DOOR_H * 0.8) / 300;
const HIDE = { x: DOOR_X, y: DOOR_FLOOR_Y - 120 * HIDE_SCALE, scale: HIDE_SCALE } as const;

/**
 * Q3. 몰래 결식하고 전자레인지 돌리기.
 * [🫣 숨기] 버튼을 누르고 있는 동안 세탁실에 숨는다 (샤워장과 같은 홀드 조작).
 * 손을 떼면 전자레인지 앞으로 돌아와 조리가 진행된다 (내부 조명 + 가동음).
 * 선배는 예고 없이 복도의 여러 지점 중 한 곳에 갑자기 나타난다.
 * 등장 순간의 반응 유예(reactMs) 안에 숨지 못하면 발각.
 * 100% 도달 = "삐-" 소리와 함께 즉시 성공. 단, 완전소등 전에 끝내야 한다.
 */
export class MicrowaveScene extends BaseMainScene {
  private zone: Zone = 'micro';
  /** 다가오는 발소리 타이머 */
  private stepTimer: Phaser.Time.TimerEvent | null = null;
  private seniorState: 'away' | 'in' = 'away';
  private reacted = false;
  private cookProgressMs = 0;
  private cookTotalMs = 1;
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
  private ovenLight!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'microwave' });
  }

  /** 심야 취사장을 도는 건 선배가 아니라 당직훈육관이다 */
  protected override closeupKey(): string {
    return 'duty_closeup';
  }

  create(): void {
    this.zone = 'micro';
    this.seniorState = 'away';
    this.cookProgressMs = 0;
    this.lightsLastSec = -1;
    this.stepTimer = null;

    // 심야 복도 배경 (실제 사진 기반) — 전자레인지는 복도, 세탁실은 왼쪽 문 안.
    // 세로 화면에 맞추며 좌우가 잘리므로 살짝 우측으로 밀어 '세탁실' 문과 복도 끝을 함께 담는다.
    addSceneBg(this, 'bg_micro').x += 80;
    // 조리 중에만 켜지는 내부 조명 — 창 안쪽이 따뜻하게 밝아지는 것만으로 충분하다
    // (주변 원형 글로우와 🍜 이모티콘은 과해서 걷어냈다)
    this.ovenLight = this.add.graphics().setVisible(false);
    this.ovenLight.fillStyle(0xffd98a, 0.5);
    this.ovenLight.fillRoundedRect(OVEN_X - 205, OVEN_Y - 80, 235, 165, 10);
    addVignette(this, 0.3);

    // 조리 게이지
    const barBg = this.add.graphics().setDepth(29);
    barBg.fillStyle(0x000000, 0.55);
    barBg.fillRoundedRect(GAME_WIDTH / 2 - 250, 80, 500, 44, 10);
    this.cookFill = this.add.graphics().setDepth(29);
    this.cookLabel = this.add
      .text(GAME_WIDTH / 2, 102, '조리 0%', {
        fontFamily: FONT,
        fontSize: '26px',
        color: COLORS.textCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(30);

    // 완전소등 카운트다운 — 이 시간 안에 "삐-"까지 끝내야 한다
    const lightsBg = this.add.graphics().setDepth(29);
    lightsBg.fillStyle(0x000000, 0.55);
    lightsBg.fillRoundedRect(GAME_WIDTH / 2 - 250, 132, 500, 36, 10);
    this.lightsFill = this.add.graphics().setDepth(29);
    this.lightsLabel = this.add
      .text(GAME_WIDTH / 2, 150, '', {
        fontFamily: FONT,
        fontSize: '22px',
        color: COLORS.textCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(30);

    this.beepText = this.add
      .text(OVEN_X - 90, OVEN_Y - 160, '삐 ─ 완성!!', {
        fontFamily: FONT,
        fontSize: '44px',
        color: COLORS.safeCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);

    // 전투복+전투모+훈육 완장의 당직훈육관
    this.senior = new Cadet(this, 690, 700, 'duty');
    this.senior.setScale(0.3).setVisible(false).setDepth(6);

    // 나는 전자레인지를 마주 보고 서 있다 — 카메라 코앞이라 뒷모습 상반신만 보인다
    this.player = new Cadet(this, NEAR.x, NEAR.y, 'player', false, { back: true });
    this.player.setScale(NEAR.scale).setDepth(8);

    // 홀드 버튼 — 누르는 동안 세탁실에 숨는다 (샤워장과 같은 조작감)
    const hideBtn = new Button(this, GAME_WIDTH / 2, GAME_HEIGHT - 190, {
      label: '🫣 세탁실에 숨기 (꾹)',
      width: 480,
      height: 150,
      color: COLORS.accent,
      fontSize: 40,
      onDown: () => this.moveTo('laundry'),
      onUp: () => this.moveTo('micro'),
    });
    hideBtn.setDepth(30);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 90, '누르는 동안 숨는다 · 소등 전에 조리 100%를 채우면 성공!', {
        fontFamily: FONT,
        fontSize: '24px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5)
      .setDepth(30);

    this.setupCommon();
    this.cookTotalMs = Q3_MICROWAVE.cookMs(this.day);
    this.lightsTotalMs = Q3_MICROWAVE.lightsOutMs(this.day);
    this.lightsRemainMs = this.lightsTotalMs;

    this.startSeniorLoop({
      tempo: () => Q3_MICROWAVE.tempo(this.day),
      onEnter: () => {
        this.seniorState = 'in';
        this.reacted = false;
        // 복도 저 끝에서 모습을 드러내 이쪽으로 걸어온다 — 멀수록 작고, 다가올수록 커진다
        const startFeet = randFloat(672, 700);
        const endFeet = chance(0.35) ? randFloat(980, 1060) : randFloat(850, 930);
        this.senior.setVisible(true).setMotion('walk');
        this.placeOnFloor(this.senior, randFloat(630, 690), startFeet);
        this.tweens.killTweensOf(this.senior);
        this.tweens.add({
          targets: this.senior,
          x: randFloat(430, 560),
          y: endFeet - 120 * this.scaleAt(endFeet),
          scale: this.scaleAt(endFeet),
          duration: Q3_MICROWAVE.reactMs(this.day) * 1.6,
          ease: 'Sine.easeIn',
        });
        // 다가오는 전투화 발소리 — 가까워질수록 커진다.
        // 화면을 안 보고 있어도 '오고 있다'가 귀로 먼저 들어온다.
        this.stepTimer?.remove();
        let step = 0;
        this.stepTimer = this.time.addEvent({
          delay: 300,
          repeat: 7,
          callback: () => {
            if (this.finished || this.seniorState !== 'in') return;
            step += 1;
            audio.footstep(Math.min(1, 0.25 + step * 0.12));
          },
        });

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
        this.stepTimer?.remove();
        this.stepTimer = null;
        this.tweens.killTweensOf(this.senior);
        this.senior.setVisible(false);
      },
    });
  }

  /** 바닥 위 거리에 따른 크기 — 서 있는 사람의 머리는 항상 소실점(HORIZON) 근처에 온다 */
  private scaleAt(feetY: number): number {
    return Math.max(0.18, (feetY - HORIZON) / 300);
  }

  /** 발끝이 바닥 feetY에 정확히 닿도록 배치 (스프라이트 밑변 = 발끝) */
  private placeOnFloor(cadet: Cadet, x: number, feetY: number): void {
    const s = this.scaleAt(feetY);
    cadet.setScale(s).setPosition(x, feetY - 120 * s);
  }

  private moveTo(zone: Zone): void {
    if (this.finished || this.zone === zone) return;
    this.zone = zone;
    const hiding = zone === 'laundry';
    const to = hiding ? HIDE : NEAR;
    this.tweens.killTweensOf(this.player);
    // 숨을 땐 복도를 가로질러 세탁실 문 안으로 쏙 들어가 몸을 접어 넣고(정면),
    // 나올 땐 다시 전자레인지 앞에 등을 보이고 선다.
    // (짧은 거리를 미끄러지듯 옮기는 트윈이라 달리기 모션은 오히려 어색하다 — 쓰지 않는다)
    this.player.setBack(!hiding);
    this.player.setMotion(hiding ? 'hide' : 'idle');
    this.player.setBodyTint(hiding ? 0x8492ad : undefined);
    this.tweens.add({
      targets: this.player,
      x: to.x,
      y: to.y,
      scale: to.scale,
      duration: 240,
      ease: 'Cubic.easeOut',
    });
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

    // 전자레인지 가동음 "위이이잉" + 내부 조명 — 앞에 서서 조리 중일 때만
    const cooking = this.zone === 'micro';
    if (cooking) audio.startMicrowaveHum();
    else audio.stopMicrowaveHum();
    this.ovenLight.setVisible(cooking);

    // 전자레인지 앞에 있을 때만 조리 진행 — 100% = "삐-"와 함께 즉시 성공
    if (cooking) {
      this.cookProgressMs += delta;
      if (this.cookProgressMs >= this.cookTotalMs) {
        this.ovenLight.setVisible(false); // 조리 완료 — 내부 조명 소등
        this.beepText.setVisible(true);
        this.tweens.add({
          targets: this.beepText,
          scale: { from: 1, to: 1.3 },
          duration: 200,
          yoyo: true,
          repeat: 2,
        });
        audio.microwaveBeep();
        this.player.setFace('😋');
        this.succeed('삐- 라면 획득! 흔적도 없이 순삭했다.');
        return;
      }
    }

    const ratio = Math.min(1, this.cookProgressMs / this.cookTotalMs);
    this.cookFill.clear();
    this.cookFill.fillStyle(ratio > 0.9 ? COLORS.accent : COLORS.warn, 1);
    this.cookFill.fillRoundedRect(GAME_WIDTH / 2 - 244, 86, 488 * ratio, 32, 7);
    this.cookLabel.setText(`조리 ${Math.floor(ratio * 100)}%`);
  }
}

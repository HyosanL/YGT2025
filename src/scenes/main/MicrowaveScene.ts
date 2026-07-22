import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q3_MICROWAVE } from '../../config';
import { audio } from '../../core/AudioManager';
import { Button } from '../../ui/Button';
import { Cadet } from '../../ui/Characters';
import { addSceneBg, addVignette } from '../../ui/Scenery';

import { BaseMainScene } from './BaseMainScene';

type Zone = 'laundry' | 'micro';

/**
 * 배경(bg_micro, 원본 900×1020) 위의 실측 좌표 — 전부 **원본 픽셀** 기준이고,
 * create()에서 cover 스케일·구도 시프트를 반영해 화면 좌표로 변환한다.
 * (예전엔 특정 화면 높이에서 잰 화면 좌표 상수라 기기 비율이 다르면 전부 어긋났다)
 */
const SRC = {
  /** 원본 중심 (900/2, 1020/2) */
  cx: 450,
  cy: 510,
  /** 복도 소실점(저 끝) 높이 — 원근 기준선. (소실점 자체는 cover 크롭으로 화면 밖) */
  vanish: { x: 118, y: 336 },
  /** 전자레인지 유리창(안쪽 유리) 실측 사각 — 조리 불빛을 여기에 정확히 얹는다 */
  ovenWin: { x: 368, y: 628, w: 242, h: 132 },
  /**
   * 훈육관 복도 경로 — 복도의 **화면에 보이는 가장 먼 지점**에서 점처럼 나타나
   * 복도 바닥을 따라 내려온다. 진짜 소실점(x 118)은 세로 화면 cover 크롭에 잘려
   * 모든 지원 비율에서 화면 왼쪽 밖이라, 가시 구간(x ≥ ~290) 안의 바닥 경로를 쓴다.
   */
  dutyFar: { x: 295, y: 452 },
  dutyNear: { x: 305, y: 545 },
  /** 전자레인지 앞의 나 (x만 사용 — 발끝은 화면 하단 밖으로 프레이밍) */
  player: { x: 652 },
  /** 오른쪽 벽의 실제 세탁실 문 (배경에 그려져 있다) — 숨는 자리 */
  door: { x: 762, bottomY: 735 },
} as const;
/** 전자레인지 앞 내 크기 — 원근 계산값 그대로면 화면을 너무 차지해 보정 */
const NEAR_SCALE = 1.6;
/** 세탁실 문에 붙어 숨을 때 크기 */
const HIDE_SCALE = 1.2;

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
  /** 배경 실측 좌표를 화면 좌표로 변환한 값들 (create에서 계산) */
  private horizonY = 0;
  private nearPos = { x: 0, y: 0, scale: 1 };
  private hidePos = { x: 0, y: 0, scale: 1 };
  private dutyFarPt = { x: 0, feetY: 0 };
  private dutyNearPt = { x: 0, feetY: 0 };
  private dutyTween: Phaser.Tweens.Tween | null = null;

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

    // 심야 복도 배경 — cover 스케일 후 원본 px 좌표를 화면 좌표로 매핑.
    // 세로 화면에 맞추며 좌우가 잘리므로 살짝 우측으로 밀어 세탁실 문과 복도 끝을 함께 담는다.
    const bg = addSceneBg(this, 'bg_micro');
    bg.x -= 64 * bg.scaleX;
    const s = bg.scaleX;
    const mx = (px: number): number => bg.x + (px - SRC.cx) * s;
    const my = (py: number): number => bg.y + (py - SRC.cy) * s;
    /** 화면 비율이 달라도 배경 확대율에 비례해 인물 크기를 맞추는 보정 계수 */
    const sNorm = (s * 1020) / 1280;

    this.horizonY = my(SRC.vanish.y);
    this.dutyFarPt = { x: mx(SRC.dutyFar.x), feetY: my(SRC.dutyFar.y) };
    this.dutyNearPt = { x: mx(SRC.dutyNear.x), feetY: my(SRC.dutyNear.y) };
    // 나는 카메라 코앞 — 발끝을 화면 아래로 내보내 상반신 위주로 프레이밍한다.
    // (배경 바닥선(src 890)에 발을 붙이면 모든 비율에서 홀드 버튼이 종아리를 가린다)
    this.nearPos = {
      x: mx(SRC.player.x),
      y: GAME_HEIGHT + 56 - 120 * NEAR_SCALE * sNorm,
      scale: NEAR_SCALE * sNorm,
    };
    // 숨는 자리 = 배경에 실제로 그려진 오른쪽 세탁실 문. 발끝을 문 밑단에 붙이되,
    // 문이 오른쪽 크롭에 걸리는 길쭉한 화면(H>1480)에서는 화면 안으로 당긴다.
    this.hidePos = {
      x: Math.min(mx(SRC.door.x), GAME_WIDTH - 78),
      y: my(SRC.door.bottomY) - 120 * HIDE_SCALE * sNorm,
      scale: HIDE_SCALE * sNorm,
    };

    // 조리 중에만 켜지는 내부 조명 — 유리창 실측 사각을 매핑해 정확히 얹는다
    const winX = mx(SRC.ovenWin.x);
    const winY = my(SRC.ovenWin.y);
    const winW = SRC.ovenWin.w * s;
    const winH = SRC.ovenWin.h * s;
    this.ovenLight = this.add.graphics().setVisible(false);
    this.ovenLight.fillStyle(0xffdf85, 0.62);
    this.ovenLight.fillRoundedRect(winX, winY, winW, winH, 8);
    // 가운데를 한 겹 더 밝게
    this.ovenLight.fillStyle(0xfff4cf, 0.5);
    this.ovenLight.fillRoundedRect(
      winX + winW * 0.12,
      winY + winH * 0.12,
      winW * 0.76,
      winH * 0.76,
      6
    );

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
      .text(winX + winW / 2 + 60, winY - 130, '삐 ─ 완성!!', {
        fontFamily: FONT,
        fontSize: '44px',
        color: COLORS.safeCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);

    // 전투복+전투모+훈육 완장의 당직훈육관 — 복도 소실점 앞에서 대기
    this.senior = new Cadet(this, this.dutyFarPt.x, 0, 'duty');
    this.senior.setDepth(6).setVisible(false);
    this.placeOnFloor(this.senior, this.dutyFarPt.x, this.dutyFarPt.feetY);

    // 나는 전자레인지를 마주 보고 서 있다 — 카메라 코앞이라 뒷모습 상반신 위주로 보인다
    this.player = new Cadet(this, this.nearPos.x, this.nearPos.y, 'player', false, { back: true });
    this.player.setScale(this.nearPos.scale).setDepth(8);

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
        // **복도 소실점**에서 점처럼 나타나 복도를 따라 정확히 걸어 내려온다.
        // 경로 위 매 지점에서 원근 배율을 다시 계산하므로 발이 바닥에서 뜨지 않는다.
        // 근점은 매번 조금씩 달라 조우가 단조롭지 않게 한다.
        const tEnd = 0.82 + Math.random() * 0.18;
        this.senior.setVisible(true).setMotion('walk');
        this.placeOnFloor(this.senior, this.dutyFarPt.x, this.dutyFarPt.feetY);
        this.tweens.killTweensOf(this.senior);
        this.dutyTween?.remove();
        const prog = { t: 0 };
        this.dutyTween = this.tweens.add({
          targets: prog,
          t: tEnd,
          duration: Q3_MICROWAVE.reactMs(this.day) * 2.6,
          ease: 'Cubic.easeIn',
          onUpdate: () => {
            const fx = Phaser.Math.Linear(this.dutyFarPt.x, this.dutyNearPt.x, prog.t);
            const fy = Phaser.Math.Linear(this.dutyFarPt.feetY, this.dutyNearPt.feetY, prog.t);
            this.placeOnFloor(this.senior, fx, fy);
          },
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
            this.stopDutyApproach();
            this.failCaught(this.senior, '반응이 늦었다! 전자레인지 앞에 서 있는 걸 들켰다.');
          }
        });
      },
      onLeave: () => {
        this.seniorState = 'away';
        this.stopDutyApproach();
        this.tweens.killTweensOf(this.senior);
        this.senior.setVisible(false);
      },
    });
  }

  /**
   * 접근 트윈·발소리 정리 — failCaught 직전에 반드시 부른다.
   * (트윈 타깃이 진행도 객체라 killTweensOf(senior)로는 죽지 않고,
   * 살아 있으면 돌진 연출 내내 placeOnFloor가 위치를 복도로 되돌린다)
   */
  private stopDutyApproach(): void {
    this.stepTimer?.remove();
    this.stepTimer = null;
    this.dutyTween?.remove();
    this.dutyTween = null;
  }

  /** 바닥 위 거리에 따른 크기 — 서 있는 사람의 머리는 항상 소실점 높이 근처에 온다 */
  private scaleAt(feetY: number): number {
    return Math.max(0.1, (feetY - this.horizonY) / 360);
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
    const to = hiding ? this.hidePos : this.nearPos;
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
      this.stopDutyApproach();
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

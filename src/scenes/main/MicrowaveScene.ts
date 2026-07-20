import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q3_MICROWAVE } from '../../config';
import { audio } from '../../core/AudioManager';
import { Button } from '../../ui/Button';
import { Cadet } from '../../ui/Characters';
import { addSceneBg, addVignette } from '../../ui/Scenery';
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
 * [🫣 숨기] 버튼을 누르고 있는 동안 세탁실에 숨는다 (샤워장과 같은 홀드 조작).
 * 손을 떼면 전자레인지 앞으로 돌아와 조리가 진행된다 (내부 조명 + 가동음).
 * 선배는 예고 없이 복도의 여러 지점 중 한 곳에 갑자기 나타난다.
 * 등장 순간의 반응 유예(reactMs) 안에 숨지 못하면 발각.
 * 100% 도달 = "삐-" 소리와 함께 즉시 성공. 단, 완전소등 전에 끝내야 한다.
 */
export class MicrowaveScene extends BaseMainScene {
  private zone: Zone = 'micro';
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

  create(): void {
    this.zone = 'micro';
    this.seniorState = 'away';
    this.cookProgressMs = 0;
    this.lightsLastSec = -1;

    // 심야 세탁실+취사구역 배경 (실제 사진 기반) — 전자레인지는 복도, 세탁실은 문 안
    addSceneBg(this, 'bg_micro');
    // 조리 중에만 켜지는 내부 조명 (창 안쪽 따뜻한 빛 + 주변 은은한 글로우)
    this.ovenLight = this.add.graphics().setVisible(false);
    this.ovenLight.fillStyle(0xffe9b0, 0.18);
    this.ovenLight.fillCircle(528, 640, 96);
    this.ovenLight.fillStyle(0xffd98a, 0.6);
    this.ovenLight.fillRoundedRect(464, 594, 128, 92, 6);
    this.add.text(530, 640, '🍜', { fontFamily: FONT, fontSize: '48px' }).setOrigin(0.5);
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
      .text(530, 480, '삐 ─ 완성!!', {
        fontFamily: FONT,
        fontSize: '44px',
        color: COLORS.safeCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.senior = new Cadet(this, GAME_WIDTH / 2, 340, 'senior');
    this.senior.setScale(0.7).setVisible(false).setDepth(5);

    this.player = new Cadet(this, MICRO_X, PLAYER_Y, 'player');
    this.player.setFace('🤤');

    // 홀드 버튼 — 누르는 동안 세탁실에 숨는다 (샤워장과 같은 조작감)
    new Button(this, GAME_WIDTH / 2, GAME_HEIGHT - 190, {
      label: '🫣 세탁실에 숨기 (꾹)',
      width: 480,
      height: 150,
      color: COLORS.accent,
      fontSize: 40,
      onDown: () => this.moveTo('laundry'),
      onUp: () => this.moveTo('micro'),
    });
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 90, '누르는 동안 숨는다 · 소등 전에 조리 100%를 채우면 성공!', {
        fontFamily: FONT,
        fontSize: '24px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5);

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

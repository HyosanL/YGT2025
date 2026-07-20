import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q1_SHOWER } from '../../config';
import { audio } from '../../core/AudioManager';
import { Button } from '../../ui/Button';
import { Cadet } from '../../ui/Characters';
import { addSceneBg, addVignette } from '../../ui/Scenery';
import { chance, randFloat, randRange } from '../../utils/rng';
import { BaseMainScene } from './BaseMainScene';

/**
 * 배경(bg_shower)을 얹은 뒤의 실제 좌표.
 * 사람 키는 발끝 y 하나로 정해진다 — 멀수록(위) 작고 가까울수록(아래) 크다.
 * 이 규칙으로만 배치하면 캐릭터가 바닥에서 뜨는 일이 없다.
 */
const heightAt = (feetY: number): number => Math.max(90, feetY - 500);
/** 샤워장 안쪽 끝(입구 쪽) — 멀리서 불쑥 들어온다 */
const DOOR_X = 438;
const DOOR_FEET = 924;
/** 바로 옆 칸 커튼 — 코앞이라 크게 보인다 */
const CURTAIN_X = 104;
const CURTAIN_FEET = 1070;
/** 내가 샤워 중인 자리 (샤워기 바로 아래) */
const ME_X = 248;
const ME_FEET = 1062;

type SeniorSpot = 'door' | 'curtain';

/**
 * Q1. 샤워장에서 몰래 노래 틀기.
 * 노래는 기본 재생 — [⏸] 버튼을 누르고 있는 동안만 멈춘다 (몰래춤추기의 반전 구조).
 * 선배는 예고 없이 정문 또는 옆 칸 커튼 중 무작위 위치에서 갑자기 나타난다.
 * 등장 순간의 짧은 반응 유예(reactMs) 안에 버튼을 누르지 못하면 발각. 선배가 나갈 때까지 홀드 유지.
 */
export class ShowerScene extends BaseMainScene {
  private holding = false;
  private seniorState: 'away' | 'in' = 'away';
  private reacted = false;
  private seniorSpot: SeniorSpot = 'door';
  private songProgressMs = 0;
  private showerRemainMs = 1;
  private songMs = 1;
  private showerTotalMs = 1;

  /** 김에 가려 실루엣만 보이는 나 (전신 캐릭터가 아니라 실루엣 이미지) */
  private me!: Phaser.GameObjects.Image;
  private senior!: Cadet;
  private songFill!: Phaser.GameObjects.Graphics;
  private timeFill!: Phaser.GameObjects.Graphics;
  private noteTimer!: Phaser.Time.TimerEvent;

  constructor() {
    super({ key: 'shower' });
  }

  /** 몰래 트는 노래 자체가 게임플레이 — BGM은 끈다 */
  protected bgmTrack(): null {
    return null;
  }

  create(): void {
    this.holding = false;
    this.seniorState = 'away';
    this.songProgressMs = 0;
    this.songMs = Q1_SHOWER.songMs;

    // 샤워장 배경 (생성 이미지)
    addSceneBg(this, 'bg_shower');
    this.add.particles(ME_X - 12, 430, '__WHITE', {
      speedY: { min: 300, max: 420 },
      speedX: { min: -20, max: 20 },
      scale: { start: 0.12, end: 0.05 },
      alpha: { start: 0.5, end: 0 },
      lifespan: 900,
      quantity: 2,
      tint: 0x9ad4f5,
    });

    // 나 — 옷을 벗고 씻는 중이라 몸은 짙은 김에 완전히 가려지고 실루엣만 어렴풋이 보인다
    const meH = heightAt(ME_FEET);
    this.me = this.add.image(ME_X, ME_FEET, 'player_shower').setOrigin(0.5, 1).setDepth(6);
    // 두 실루엣의 원본 비율이 달라도 같은 배율을 써야 자세만 바뀌고 덩치는 그대로다
    this.me.setScale(meH / (this.me.height || meH));
    this.tweens.add({
      targets: this.me,
      y: ME_FEET - 10,
      duration: 320,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 몸을 감싸는 짙은 수증기 (에셋의 김과 이어져 몸을 확실히 가린다)
    const bank = this.add.graphics().setDepth(7);
    for (const [y, rx, ry, a] of [
      [ME_FEET - meH * 0.42, 210, 95, 0.5],
      [ME_FEET - meH * 0.16, 260, 130, 0.55],
      [ME_FEET + 40, 340, 150, 0.6],
    ] as const) {
      bank.fillStyle(0xeef7fa, a);
      bank.fillEllipse(ME_X, y, rx, ry);
    }
    this.add
      .particles(ME_X, ME_FEET - meH * 0.35, '__WHITE', {
        x: { min: -120, max: 120 },
        y: { min: -90, max: 140 },
        speedY: { min: -30, max: -10 },
        scale: { start: 2.8, end: 5.0 },
        alpha: { start: 0.3, end: 0 },
        lifespan: 2400,
        frequency: 70,
        tint: 0xeef7fa,
      })
      .setDepth(7);

    // 샤워장 전체에 낀 옅은 김
    this.add.particles(0, 0, '__WHITE', {
      x: { min: 40, max: 690 },
      y: 900,
      speedY: { min: -18, max: -40 },
      speedX: { min: -8, max: 8 },
      scale: { start: 2.2, end: 3.8 },
      alpha: { start: 0.06, end: 0 },
      lifespan: 3600,
      frequency: 380,
      tint: 0xdff4f6,
    });
    addVignette(this, 0.2);

    this.senior = new Cadet(this, DOOR_X, DOOR_FEET - 200, 'senior');
    this.senior.setVisible(false).setDepth(5);

    // 노래 진행 바
    const songBarBg = this.add.graphics();
    songBarBg.fillStyle(0x000000, 0.55);
    songBarBg.fillRoundedRect(GAME_WIDTH / 2 - 250, 70, 500, 42, 10);
    this.songFill = this.add.graphics();
    this.add
      .text(GAME_WIDTH / 2, 91, '🎵 노래 진행', {
        fontFamily: FONT,
        fontSize: '24px',
        color: COLORS.textCss,
      })
      .setOrigin(0.5)
      .setDepth(10);

    // 샤워 시간 바
    const timeBarBg = this.add.graphics();
    timeBarBg.fillStyle(0x000000, 0.55);
    timeBarBg.fillRoundedRect(GAME_WIDTH / 2 - 250, 126, 500, 34, 10);
    this.timeFill = this.add.graphics();
    this.add
      .text(GAME_WIDTH / 2, 143, '⏱ 남은 샤워 시간', {
        fontFamily: FONT,
        fontSize: '22px',
        color: COLORS.textCss,
      })
      .setOrigin(0.5)
      .setDepth(10);

    // 홀드 버튼
    new Button(this, GAME_WIDTH / 2, GAME_HEIGHT - 190, {
      label: '⏸ 숨죽이기 (꾹)',
      width: 480,
      height: 150,
      color: COLORS.accent,
      fontSize: 40,
      onDown: () => {
        this.holding = true;
        this.me.setTexture('player_shower_quiet');
      },
      onUp: () => {
        this.holding = false;
        this.me.setTexture('player_shower');
      },
    });
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 90, '누르는 동안 노래 정지 · 선배가 나갈 때까지 유지!', {
        fontFamily: FONT,
        fontSize: '24px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5);

    this.setupCommon();
    this.showerTotalMs = Q1_SHOWER.showerTimeMs(this.day);
    this.showerRemainMs = this.showerTotalMs;

    // 떠다니는 음표 연출
    this.noteTimer = this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        if (this.holding || this.finished) return;
        const note = this.add
          .text(ME_X + Math.random() * 120 - 60, 560, '♪', {
            fontFamily: FONT,
            fontSize: '38px',
            color: '#ffd9e2',
          })
          .setOrigin(0.5);
        this.tweens.add({
          targets: note,
          y: 460,
          alpha: 0,
          duration: 1200,
          onComplete: () => note.destroy(),
        });
      },
    });
    void this.noteTimer;

    // 실음원(1.25배속 + 욕실 리버브) 재생 — 미로드 시 칩튠 폴백
    audio.startSong();
    // 샤워기 물소리는 노래 일시정지 중에도 계속 흐른다
    audio.startShowerNoise();

    this.startSeniorLoop({
      params: () => ({
        gapMs: randRange(Q1_SHOWER.gapMsRange(this.day)),
        stayMs: randRange(Q1_SHOWER.stayMsRange(this.day)),
      }),
      onEnter: () => {
        this.seniorState = 'in';
        this.reacted = false;
        this.seniorSpot = chance(0.5) ? 'door' : 'curtain';
        // 입구(방 안쪽 끝)에서 불쑥, 또는 바로 옆 칸 커튼에서 코앞으로.
        // 발끝 y로 크기가 결정되므로 어느 쪽이든 바닥에 발이 붙는다.
        const feet =
          (this.seniorSpot === 'door' ? DOOR_FEET : CURTAIN_FEET) + randFloat(-16, 16);
        const x = (this.seniorSpot === 'door' ? DOOR_X : CURTAIN_X) + randFloat(-22, 22);
        const s = heightAt(feet) / 300;
        this.senior.setScale(s).setPosition(x, feet - 120 * s);
        this.senior.setVisible(true);
        // 옆 칸 커튼 쪽은 더 가깝지만, 반응창은 터치 반응 한계(360ms) 밑으로 안 내려간다
        const reactMs = Math.max(
          360,
          Q1_SHOWER.reactMs(this.day) * (this.seniorSpot === 'curtain' ? 0.7 : 1)
        );
        this.time.delayedCall(reactMs, () => {
          if (this.finished || this.seniorState !== 'in') return;
          if (this.holding) {
            this.reacted = true;
          } else {
            this.failCaught(this.senior, '반응이 늦었다! 노랫소리를 들켰다.');
          }
        });
      },
      onLeave: () => {
        this.seniorState = 'away';
        this.senior.setVisible(false);
      },
    });
  }

  protected tick(delta: number): void {
    this.showerRemainMs -= delta;
    if (this.showerRemainMs <= 0) {
      this.fail('노래를 다 듣기 전에 샤워 시간이 끝나버렸다...');
      return;
    }

    const playing = !this.holding;
    audio.setSongPlaying(playing && !this.finished);
    // 오디오 언락이 늦었어도 물소리가 뒤늦게라도 흐르도록 (내부 가드로 매 프레임 안전)
    audio.startShowerNoise();
    if (playing) {
      this.songProgressMs += delta;
      if (this.songProgressMs >= this.songMs) {
        this.succeed('노래를 끝까지 들었다! 오늘의 낭만 완수.');
        return;
      }
    }

    // 반응에 성공해 숨은 뒤, 선배가 있는 동안 손을 떼면 발각
    if (this.seniorState === 'in' && this.reacted && !this.holding) {
      this.failCaught(this.senior, '선배 앞에서 노래가 다시 흘러나왔다...!');
      return;
    }

    const songRatio = Math.min(1, this.songProgressMs / this.songMs);
    this.songFill.clear();
    this.songFill.fillStyle(COLORS.accent, 1);
    this.songFill.fillRoundedRect(GAME_WIDTH / 2 - 244, 76, 488 * songRatio, 30, 7);

    const timeRatio = Math.max(0, this.showerRemainMs / this.showerTotalMs);
    this.timeFill.clear();
    this.timeFill.fillStyle(timeRatio < 0.25 ? COLORS.warn : 0x4a90d9, 1);
    this.timeFill.fillRoundedRect(GAME_WIDTH / 2 - 244, 131, 488 * timeRatio, 24, 6);
  }
}

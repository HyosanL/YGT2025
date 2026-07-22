import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q1_SHOWER } from '../../config';
import { audio } from '../../core/AudioManager';
import { Button } from '../../ui/Button';
import { Cadet } from '../../ui/Characters';
import { addSceneBg, addVignette } from '../../ui/Scenery';
import { randFloat } from '../../utils/rng';
import { BaseMainScene } from './BaseMainScene';

/**
 * 배경(bg_shower, 원본 900×900) 위의 실측 좌표 — 전부 **원본 픽셀** 기준이고,
 * create()에서 cover 스케일을 반영해 화면 좌표로 변환한다.
 * 사람 키는 발끝 y 하나로 정해진다 — 멀수록(위) 작고 가까울수록(아래) 크다.
 */
const SRC = {
  cx: 450,
  cy: 450,
  /** 카메라 눈높이(원근 기준선) — heightAt의 0점 */
  eyeY: 352,
  /** 내가 샤워 중인 자리 (마지막 샤워칸 옆 열린 바닥, 발끝) */
  me: { x: 390, feetY: 700 },
  /** 선배가 밀고 들어와 멈추는 자리 (발끝) */
  seniorIn: { x: 580, feetY: 705 },
} as const;
/** 선배는 언제나 화면 오른쪽 문에서 밀고 나온다 — 화면 밖 대기 위치 */
const SENIOR_OFF_X = GAME_WIDTH + 190;
/** 실루엣 크기 보정 — 원근 계산값 그대로면 화면을 너무 차지한다 */
const ME_SHRINK = 0.78;

/**
 * Q1. 샤워장에서 몰래 노래 틀기.
 * 노래는 기본 재생 — [⏸] 버튼을 누르고 있는 동안만 멈춘다 (몰래춤추기의 반전 구조).
 * 선배는 예고 없이 **화면 오른쪽 문**에서 밀고 나왔다가 다시 그쪽으로 들어간다 (방향 고정).
 * 등장 순간의 짧은 반응 유예(reactMs) 안에 버튼을 누르지 못하면 발각. 선배가 나갈 때까지 홀드 유지.
 */
export class ShowerScene extends BaseMainScene {
  private holding = false;
  private seniorState: 'away' | 'in' = 'away';
  private reacted = false;
  private songProgressMs = 0;
  private showerRemainMs = 1;
  private songMs = 1;
  private showerTotalMs = 1;

  /** 김에 가려 실루엣만 보이는 나 (전신 캐릭터가 아니라 실루엣 이미지) */
  private me!: Phaser.GameObjects.Image;
  private senior!: Cadet;
  /** 선배가 밀고 들어와 멈추는 x (배경 매핑값) */
  private seniorInX = 545;
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

    // 샤워장 배경 — cover 스케일 후 원본 px 좌표를 화면 좌표로 매핑
    const bg = addSceneBg(this, 'bg_shower');
    const s = bg.scaleX;
    const mx = (px: number): number => bg.x + (px - SRC.cx) * s;
    const my = (py: number): number => bg.y + (py - SRC.cy) * s;
    const heightAt = (feetY: number): number => Math.max(90, feetY - my(SRC.eyeY));

    const meX = mx(SRC.me.x);
    const meFeet = my(SRC.me.feetY);
    const meH = heightAt(meFeet) * ME_SHRINK;

    // 쏟아지는 물줄기 — 머리 위에서 발끝까지
    this.add.particles(meX - 10, meFeet - meH - 30, '__WHITE', {
      speedY: { min: 300, max: 420 },
      speedX: { min: -20, max: 20 },
      scale: { start: 0.12, end: 0.05 },
      alpha: { start: 0.5, end: 0 },
      lifespan: 1100,
      quantity: 2,
      tint: 0x9ad4f5,
    });

    // 나 — 옷을 벗고 씻는 중이라 실루엣만 보인다.
    // 발끝을 실측한 바닥선에 붙이고, 접지 그림자를 깔아 공중에 뜨지 않게 한다.
    this.add
      .ellipse(meX, meFeet + 4, meH * 0.42, meH * 0.07, 0x1c4a52, 0.3)
      .setDepth(5);
    this.me = this.add.image(meX, meFeet, 'player_shower').setOrigin(0.5, 1).setDepth(6);
    // 두 실루엣의 원본 비율이 달라도 같은 배율을 써야 자세만 바뀌고 덩치는 그대로다
    this.me.setScale(meH / (this.me.height || meH));
    this.tweens.add({
      targets: this.me,
      y: meFeet - 10,
      duration: 320,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 샤워장 전체에 낀 옅은 김 — 인물이 서 있는 바닥 높이(배경 매핑)에서 피어오른다
    this.add.particles(0, 0, '__WHITE', {
      x: { min: 40, max: 690 },
      y: { min: my(560), max: my(880) },
      speedY: { min: -18, max: -40 },
      speedX: { min: -8, max: 8 },
      scale: { start: 2.2, end: 3.8 },
      alpha: { start: 0.06, end: 0 },
      lifespan: 3600,
      frequency: 380,
      tint: 0xdff4f6,
    });
    addVignette(this, 0.2);

    // 선배는 오른쪽 문 밖에 대기하다 밀고 나온다 (크기는 발끝 y로 고정)
    const seniorFeet = my(SRC.seniorIn.feetY);
    const seniorScale = heightAt(seniorFeet) / 300;
    this.seniorInX = mx(SRC.seniorIn.x);
    this.senior = new Cadet(this, SENIOR_OFF_X, seniorFeet - 120 * seniorScale, 'senior');
    this.senior.setScale(seniorScale).setVisible(false).setDepth(8);

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

    // 떠다니는 음표 연출 — 머리 위에서 피어오른다
    const noteY = meFeet - meH - 20;
    this.noteTimer = this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        if (this.holding || this.finished) return;
        const note = this.add
          .text(meX + Math.random() * 120 - 60, noteY, '♪', {
            fontFamily: FONT,
            fontSize: '38px',
            color: '#ffd9e2',
          })
          .setOrigin(0.5);
        this.tweens.add({
          targets: note,
          y: noteY - 100,
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
      tempo: () => Q1_SHOWER.tempo(this.day),
      onEnter: () => {
        this.seniorState = 'in';
        this.reacted = false;
        // 언제나 화면 오른쪽 문에서 — 밖에 서 있다가 성큼 밀고 들어온다.
        // 위치가 고정이라 '어디서 나올까'가 아니라 '얼마나 빨리 반응하나'의 게임이 된다.
        this.tweens.killTweensOf(this.senior);
        // 표정을 풀고 걸어 들어왔다가 노려보는 게 아니라, **처음부터 째려보는 채로** 밀고 나온다
        this.senior.setX(SENIOR_OFF_X).setVisible(true).setMotion('idle');
        this.tweens.add({
          targets: this.senior,
          x: this.seniorInX + randFloat(-18, 18),
          duration: 260,
          ease: 'Cubic.easeOut',
        });
        const reactMs = Q1_SHOWER.reactMs(this.day);
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
        // 다시 오른쪽 문으로 밀고 나간다
        this.tweens.killTweensOf(this.senior);
        this.tweens.add({
          targets: this.senior,
          x: SENIOR_OFF_X,
          duration: 240,
          ease: 'Cubic.easeIn',
          onComplete: () => this.senior.setVisible(false),
        });
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

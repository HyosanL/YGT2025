import Phaser from 'phaser';
import { bgmTempo, COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, QUEST_META } from '../config';
import { audio } from '../core/AudioManager';
import { gameState } from '../core/GameState';
import { questManager } from '../core/QuestManager';
import { addMuteButton } from '../ui/Button';
import { Cadet } from '../ui/Characters';
import { drawBarracks, drawCloud, drawFlagpole, drawMountains } from '../ui/Scenery';
import type { MainQuestId } from '../types';

/**
 * "N일차" 스플래시 — 리듬을 끊지 않도록 탭 없이 자동 시작한다.
 * (READY → GO! 약 1.7초, 화면 탭으로 즉시 스킵 가능)
 */
export class DayIntroScene extends Phaser.Scene {
  private started = false;

  constructor() {
    super({ key: 'DayIntro' });
  }

  create(): void {
    this.started = false;
    const day = gameState.day;
    const questId: MainQuestId = questManager.pickQuestForDay(day);
    gameState.startDay(questId);
    const meta = QUEST_META[questId];
    // 출격 준비 — 필드 BGM을 여기서부터 흘려 퀘스트로 이어지게.
    // 일차가 오를수록 리듬이 빨라진다 (새 판은 다시 1.0배부터)
    audio.setBgmTempo(bgmTempo(day));
    audio.startBgm('field');

    // 아침 연병장 배경
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2c3e6b, 0x2c3e6b, COLORS.bg, COLORS.bg, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    drawCloud(this, 140, 140, 1.0, 0.35);
    drawCloud(this, 560, 210, 0.7, 0.28);
    const sunrise = this.add.graphics();
    sunrise.fillStyle(0xffe9a8, 0.07);
    sunrise.fillCircle(GAME_WIDTH / 2, 1080, 430);
    sunrise.fillCircle(GAME_WIDTH / 2, 1080, 300);
    drawMountains(this, 1010, 150, 0x22305a, 0.8);
    drawBarracks(this, 60, 1010, 200, 110, 0x2a3660, 0xffe9a8, 0.5);
    drawBarracks(this, 470, 1010, 180, 96, 0x243158, 0xffe9a8, 0.45);
    drawFlagpole(this, 366, 1010, 140);
    const ground = this.add.graphics();
    ground.fillGradientStyle(0x2c3a66, 0x2c3a66, 0x1f2a4c, 0x1f2a4c, 1);
    ground.fillRect(0, 1010, GAME_WIDTH, GAME_HEIGHT - 1010);

    // "N일차" 등장 연출
    const dayText = this.add
      .text(GAME_WIDTH / 2, 260, `${day}일차`, {
        fontFamily: FONT,
        fontSize: '110px',
        color: COLORS.textCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScale(2)
      .setAlpha(0);
    this.tweens.add({
      targets: dayText,
      scale: 1,
      alpha: 1,
      duration: 300,
      ease: 'Back.easeOut',
    });

    this.add
      .text(GAME_WIDTH / 2, 350, 'HP 100 회복', {
        fontFamily: FONT,
        fontSize: '26px',
        color: COLORS.safeCss,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 470, '오늘의 퀘스트', {
        fontFamily: FONT,
        fontSize: '28px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 545, `${meta.emoji} ${meta.title}`, {
        fontFamily: FONT,
        fontSize: '40px',
        color: COLORS.warnCss,
        fontStyle: 'bold',
        wordWrap: { width: GAME_WIDTH - 80 },
        align: 'center',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 650, meta.tip, {
        fontFamily: FONT,
        fontSize: '28px',
        color: COLORS.textCss,
        wordWrap: { width: GAME_WIDTH - 100 },
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5);

    const cadet = new Cadet(this, GAME_WIDTH / 2, 900, 'player', true);
    this.time.delayedCall(300, () => cadet.saluteOnce(800));

    // READY → GO! 자동 시작
    const goText = this.add
      .text(GAME_WIDTH / 2, 1120, 'READY...', {
        fontFamily: FONT,
        fontSize: '54px',
        color: COLORS.subCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.time.delayedCall(1150, () => {
      if (this.started) return;
      goText.setText('GO!').setColor(COLORS.accentCss);
      audio.chime();
      this.tweens.add({ targets: goText, scale: 1.5, duration: 180, ease: 'Back.easeOut' });
    });
    this.time.delayedCall(1650, () => this.startQuest(questId));

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 50, '탭하면 바로 시작', {
        fontFamily: FONT,
        fontSize: '22px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < 100 && p.x > GAME_WIDTH - 130) return; // 음소거 버튼 영역은 무시
      this.startQuest(questId);
    });

    addMuteButton(this);
  }

  private startQuest(questId: MainQuestId): void {
    if (this.started) return;
    this.started = true;
    this.scene.start(questId);
  }
}

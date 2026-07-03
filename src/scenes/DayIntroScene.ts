import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, QUEST_META } from '../config';
import { gameState } from '../core/GameState';
import { questManager } from '../core/QuestManager';
import { addMuteButton, Button } from '../ui/Button';
import { Cadet } from '../ui/Characters';
import { DialogueBox } from '../ui/DialogueBox';
import type { MainQuestId } from '../types';

/**
 * "N일차" 연출 + HP 리셋 + 오늘의 퀘스트 소개 (미연시 대사창).
 */
export class DayIntroScene extends Phaser.Scene {
  constructor() {
    super({ key: 'DayIntro' });
  }

  create(): void {
    const day = gameState.day;
    const questId: MainQuestId = questManager.pickQuestForDay(day);
    gameState.startDay(questId);
    const meta = QUEST_META[questId];

    // 아침 느낌 배경
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2c3e6b, 0x2c3e6b, COLORS.bg, COLORS.bg, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // "N일차" 등장 연출
    const dayText = this.add
      .text(GAME_WIDTH / 2, 300, `${day}일차`, {
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
      duration: 500,
      ease: 'Back.easeOut',
    });

    this.add
      .text(GAME_WIDTH / 2, 400, 'HP가 100으로 회복되었다', {
        fontFamily: FONT,
        fontSize: '28px',
        color: COLORS.safeCss,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 500, `오늘의 퀘스트`, {
        fontFamily: FONT,
        fontSize: '30px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 570, `${meta.emoji} ${meta.title}`, {
        fontFamily: FONT,
        fontSize: '38px',
        color: COLORS.warnCss,
        fontStyle: 'bold',
        wordWrap: { width: GAME_WIDTH - 80 },
        align: 'center',
      })
      .setOrigin(0.5);

    const cadet = new Cadet(this, GAME_WIDTH / 2, 800, 'player', true);
    this.time.delayedCall(900, () => cadet.saluteOnce(1000));

    addMuteButton(this);

    const dialogue = new DialogueBox(this);
    this.time.delayedCall(700, () => {
      dialogue.showLines([...meta.intro], () => {
        new Button(this, GAME_WIDTH / 2, GAME_HEIGHT - 180, {
          label: '퀘스트 시작 ▶',
          width: 420,
          height: 110,
          color: COLORS.accent,
          fontSize: 38,
          onClick: () => this.scene.start(questId),
        });
      });
    });
  }
}

import Phaser from 'phaser';
import { bgmTempo, COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, pace, QUEST_META } from '../config';
import { audio } from '../core/AudioManager';
import { gameState } from '../core/GameState';
import { questManager } from '../core/QuestManager';
import { Cadet } from '../ui/Characters';
import { LivesBar } from '../ui/LivesBar';
import { addSceneBg } from '../ui/Scenery';
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
    addSceneBg(this, 'bg_dayintro');

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

    // 일차가 오를수록 판이 빨라진다는 걸 숫자로 체감시킨다
    const speedLabel = day >= 2 ? ` · ⚡ 속도 x${pace(day).toFixed(2)}` : '';
    this.add
      .text(GAME_WIDTH / 2, 350, `HP 100 회복${speedLabel}`, {
        fontFamily: FONT,
        fontSize: '26px',
        color: COLORS.safeCss,
      })
      .setOrigin(0.5);
    const livesBar = new LivesBar(this, GAME_WIDTH / 2 - LivesBar.widthFor(36) / 2, 380, 36);
    livesBar.setLives(gameState.livesUnits);

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
    this.time.delayedCall(900, () => {
      if (this.started) return;
      goText.setText('GO!').setColor(COLORS.accentCss);
      audio.chime();
      this.tweens.add({ targets: goText, scale: 1.5, duration: 180, ease: 'Back.easeOut' });
    });
    this.time.delayedCall(1300, () => this.startQuest(questId));

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 50, '탭하면 바로 시작', {
        fontFamily: FONT,
        fontSize: '22px',
        color: COLORS.subCss,
      })
      .setOrigin(0.5);
    // 짧은 스플래시라 별도 설정 버튼은 없다 — 어디를 탭해도 바로 시작
    this.input.on('pointerdown', () => this.startQuest(questId));
  }

  private startQuest(questId: MainQuestId): void {
    if (this.started) return;
    this.started = true;
    this.scene.start(questId);
  }
}

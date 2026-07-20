import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q5_WALLPUNCH } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import { Button, textChip } from '../../ui/Button';
import { Cadet, speechBubble } from '../../ui/Characters';
import { addSceneBg, addVignette } from '../../ui/Scenery';
import { HAPTIC, vibrate } from '../../utils/haptics';
import { chance, pick, randFloat } from '../../utils/rng';
import { BaseMainScene } from './BaseMainScene';

/**
 * 배경(bg_wallpunch_*)에서 옆방과 맞닿은 벽이 있는 화면 왼쪽 —
 * 말풍선과 충격 연출이 새어나오는 지점.
 */
const WALL_X = 150;

/** 벽 너머 1학년들의 수다 (칠 때마다 잠깐 조용해진다) */
const CHATTER_LINES = [
  'ㅋㅋㅋㅋㅋ',
  '아 진짜라니까?',
  '미쳤나봐 ㅋㅋ',
  '야 조용히 해봐 ㅋㅋ',
  '한 판만 더 하자',
  '아 배고파...',
  'ㄹㅇㅋㅋ',
];

type PunchState = 'noisy' | 'suspense' | 'done';

/**
 * Q5. 옆방(1학년 방) 벽 치기 — 선택할 수 있는 도박.
 * 침대에 누워 있는데 옆방이 시끄럽다.
 * - 벽을 친다: 무사하면 조용해지고 ❤️ 목숨 +1. 벽 너머에 사실 선배가
 *   놀러와 있었으면 문이 벌컥 열리며 "뭐하냐?" — 즉사.
 * - 참고 잔다: 시끄러운 채로 하루가 지나간다 (안전, 보상 없음).
 */
export class WallPunchScene extends BaseMainScene {
  private punchState: PunchState = 'noisy';
  private chatterEvent: Phaser.Time.TimerEvent | null = null;

  private punchBtn!: Button;
  private sleepBtn!: Button;
  private dim!: Phaser.GameObjects.Rectangle;
  private suspenseText!: Phaser.GameObjects.Text;
  /** 벽 치는 컷 — 망설이는 컷 위에 겹쳐 두고 알파만 켜서 타격 순간을 만든다 */
  private sceneHit!: Phaser.GameObjects.Image;

  constructor() {
    super({ key: 'wallpunch' });
  }

  /** 벽 치고 난 뒤의 '정적'이 연출의 핵심 — BGM은 끈다 */
  protected bgmTrack(): null {
    return null;
  }

  create(): void {
    this.punchState = 'noisy';
    this.chatterEvent = null;

    // 실제 호실 사진을 그대로 옮긴 야간 씬 — 인물이 그 방의 그 침대에 누워 있다.
    // (별도의 벽 오브젝트를 그리지 않는다 — 벽은 사진 속 진짜 왼쪽 벽이다)
    addSceneBg(this, 'bg_wallpunch_idle');
    this.sceneHit = addSceneBg(this, 'bg_wallpunch_hit', -999).setAlpha(0);
    addVignette(this, 0.35);

    textChip(this, GAME_WIDTH / 2 + 60, 120, '옆방이 너무 시끄럽다...', { fontSize: 38, depth: 10 });
    this.add
      .text(GAME_WIDTH / 2 + 60, 200, '치면 도박(❤️+1 or 끝장) · 참으면 그냥 하루가 간다', {
        fontFamily: FONT,
        fontSize: '24px',
        color: COLORS.inkCss,
        stroke: '#ffffff',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(11);

    this.dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setOrigin(0)
      .setDepth(50);

    this.suspenseText = this.add
      .text(WALL_X + 180, 460, '', {
        fontFamily: FONT,
        fontSize: '52px',
        color: COLORS.textCss,
      })
      .setOrigin(0.5)
      .setDepth(60);

    this.punchBtn = new Button(this, GAME_WIDTH / 2 + 60, GAME_HEIGHT - 280, {
      label: '👊 벽 치기 (도박)',
      width: 420,
      height: 124,
      color: COLORS.accent,
      fontSize: 36,
      onClick: () => this.punch(),
    });
    this.sleepBtn = new Button(this, GAME_WIDTH / 2 + 60, GAME_HEIGHT - 140, {
      label: '😪 참고 잔다 (안전)',
      width: 420,
      height: 104,
      color: COLORS.panelLight,
      fontSize: 32,
      onClick: () => this.sleep(),
    });

    this.setupCommon();
    this.startNoisy();
  }

  // ── 옆방 수다 (칠 때마다 조용해졌다가 다시 시작) ──

  private startNoisy(): void {
    if (this.finished) return;
    this.punchState = 'noisy';
    this.punchBtn.setEnabled(true);
    this.sleepBtn.setEnabled(true);
    audio.startChatter();
    this.spawnChatterBubble();
    this.chatterEvent = this.time.addEvent({
      delay: 1100,
      loop: true,
      callback: () => {
        if (!this.finished && this.punchState === 'noisy') {
          audio.startChatter(); // 오디오 언락이 늦어도 self-heal
          this.spawnChatterBubble();
        }
      },
    });
  }

  private stopNoisy(): void {
    this.chatterEvent?.remove();
    this.chatterEvent = null;
    audio.stopChatter();
  }

  private spawnChatterBubble(): void {
    audio.chatterBlip(); // 말풍선에 맞춰 웅얼거리는 말소리
    speechBubble(
      this,
      WALL_X + randFloat(-40, 70),
      randFloat(360, 700),
      pick(CHATTER_LINES),
      1000,
      40
    );
  }

  // ── 선택: 참고 잔다 (안전) ────────────────────

  private sleep(): void {
    if (this.finished || this.punchState !== 'noisy') return;
    this.punchState = 'done';
    this.punchBtn.setEnabled(false);
    this.sleepBtn.setEnabled(false);
    speechBubble(this, 400, 640, '(시끄럽지만... 참자...)', 1100, 40);
    this.time.delayedCall(1200, () => this.succeed('시끄러운 밤을 견뎌냈다. 내일은 조용하길...'));
  }

  // ── 선택: 벽 치기 (도박) ──────────────────────

  private punch(): void {
    if (this.finished || this.punchState !== 'noisy') return;
    this.punchState = 'suspense';
    this.punchBtn.setEnabled(false);
    this.sleepBtn.setEnabled(false);
    this.stopNoisy(); // 순간 정적

    // 쾅! 쾅! 쾅! — 3연타. 누운 채 팔을 뻗는 컷으로 갈아끼웠다 되돌리길 반복한다
    // (두 컷이 같은 방·같은 구도라 알파만 바꿔도 동작으로 읽힌다)
    audio.wallBang();
    this.cameras.main.shake(520, 0.007);
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 170, () => {
        if (this.finished) return;
        this.sceneHit.setAlpha(1);
        this.time.delayedCall(110, () => this.sceneHit.setAlpha(0));
      });
    }

    // 정적... 심장박동
    this.dim.setFillStyle(0x000000, 0.45);
    this.suspenseText.setText('. . .');
    audio.startHeartbeat();

    const suspense = randFloat(
      Q5_WALLPUNCH.suspenseMsRange[0],
      Q5_WALLPUNCH.suspenseMsRange[1]
    );
    this.time.delayedCall(suspense, () => {
      if (this.finished) return;
      audio.stopHeartbeat();
      this.dim.setFillStyle(0x000000, 0);
      this.suspenseText.setText('');

      if (chance(Q5_WALLPUNCH.seniorChance(this.day))) {
        // 벽 너머엔 선배가 놀러와 있었다 — 출입문이 벌컥 열린다
        this.time.delayedCall(400, () => {
          audio.door();
          const senior = new Cadet(this, GAME_WIDTH - 160, 620, 'senior');
          senior.setScale(0.85);
          this.failCaught(
            senior,
            '벽 너머엔 선배가 놀러와 있었다... 문이 벌컥 열렸다.',
            '뭐하냐?'
          );
        });
        return;
      }

      // 무사 — 옆방이 조용해졌다. 도박 성공, 목숨 +1
      this.punchState = 'done';
      speechBubble(this, 400, 640, '조용해졌다... 취침해야겠다...', 1500, 40);

      // 연습 모드에서는 목숨 보상이 없다
      const gained = gameState.practiceMode ? false : gameState.addLifeUnits(5);
      if (gained) {
        audio.chime();
        vibrate(HAPTIC.lifeGain);
        const lifeText = this.add
          .text(GAME_WIDTH / 2 + 60, 560, '❤️ 목숨 +1', {
            fontFamily: FONT,
            fontSize: '52px',
            color: COLORS.safeCss,
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6,
          })
          .setOrigin(0.5)
          .setDepth(60)
          .setScale(0.4);
        this.tweens.add({
          targets: lifeText,
          scale: 1,
          y: 500,
          duration: 500,
          ease: 'Back.easeOut',
        });
      }
      this.time.delayedCall(1700, () =>
        this.succeed(
          gained
            ? '도박 성공! ❤️ 목숨을 하나 얻고 꿀잠에 들었다.'
            : gameState.practiceMode
              ? '도박 성공! (연습이라 보상은 없다)'
              : '조용해졌다. (목숨은 이미 가득)'
        )
      );
    });
  }

  protected tick(_delta: number): void {
    // 판정은 전부 이벤트 기반 — 프레임 로직 없음
  }
}

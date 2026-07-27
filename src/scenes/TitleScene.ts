import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { audio } from '../core/AudioManager';
import { gameState } from '../core/GameState';
import { fetchTop, submitScore } from '../core/Leaderboard';
import { Button, showToast } from '../ui/Button';
import { Cadet, speechBubble } from '../ui/Characters';
import { showHelpPanel } from '../ui/HelpPanel';
import { showLeaderboardPanel } from '../ui/LeaderboardPanel';
import { addSceneBg } from '../ui/Scenery';
import { addVolumeButton } from '../ui/VolumePanel';
import { askDay } from '../utils/dayDialog';
import { HAPTIC, vibrate } from '../utils/haptics';
import { askNickname } from '../utils/nicknameDialog';

/** 이스터에그: 앞서 달리는 기태를 연속으로 이만큼 탭하면 발동 */
const EGG_TAP_GOAL = 25;
/** 이스터에그: 뒤쫓는 생도를 연속으로 이만큼 탭하면 발동 */
const CHASER_TAP_GOAL = 7;
/** 이 시간 안에 다음 탭이 없으면 '연속' 판정이 끊겨 카운트 리셋 */
const EGG_TAP_WINDOW_MS = 1500;

interface TitleSceneData {
  /** 연습 종료 후 복귀 — 게임설명 패널을 바로 연다 */
  openHelp?: boolean;
  /** 연습 결과 토스트 문구 */
  practiceMsg?: string;
}

export class TitleScene extends Phaser.Scene {
  private lbPanel: Phaser.GameObjects.Container | null = null;
  private helpPanel: Phaser.GameObjects.Container | null = null;
  /** 이스터에그 연속 탭 카운트 / 발동 중 재진입 잠금 */
  private eggTaps = 0;
  private eggFiring = false;
  private eggResetTimer: Phaser.Time.TimerEvent | null = null;
  private chaserTaps = 0;
  private chaserFiring = false;
  private chaserResetTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super({ key: 'Title' });
  }

  create(data?: TitleSceneData): void {
    this.lbPanel = null;
    this.helpPanel = null;
    this.eggTaps = 0;
    this.eggFiring = false;
    this.eggResetTimer = null;
    this.chaserTaps = 0;
    this.chaserFiring = false;
    this.chaserResetTimer = null;
    gameState.endPractice(); // 어떤 경로로 돌아왔든 연습 플래그 정리
    audio.setBgmTempo(1); // 타이틀은 항상 원래 템포
    audio.startBgm('title');

    // 연습 종료 복귀 — 설명 패널을 다시 열고 결과를 알려준다
    if (data?.openHelp) {
      this.time.delayedCall(50, () => this.toggleHelp());
    }
    if (data?.practiceMsg) {
      const msg = data.practiceMsg;
      this.time.delayedCall(250, () => showToast(this, msg));
    }

    // 첫 실행이면 닉네임부터 정하고 시작한다
    if (!gameState.settings.nickname) {
      this.time.delayedCall(450, () => {
        if (gameState.settings.nickname) return;
        void askNickname('', '어서 와, 생도! 닉네임부터 정하자 (1~12자)').then((name) => {
          if (name) gameState.setNickname(name);
        });
      });
    }

    addSceneBg(this, 'bg_title');

    this.add
      .text(GAME_WIDTH / 2, 420, 'YGT 2025', {
        fontFamily: FONT,
        fontSize: '96px',
        color: COLORS.textCss,
        // 밝은 연병장 배경 위에서도 읽히도록 굵은 검정 외곽선 (플랫 카툰 로고 느낌)
        stroke: COLORS.inkCss,
        strokeThickness: 10,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 505, '공사 2학년 생도의 생존기', {
        fontFamily: FONT,
        fontSize: '32px',
        color: COLORS.textCss,
        stroke: COLORS.inkCss,
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 560, '— 선배에게 걸리면 게임 오버 —', {
        fontFamily: FONT,
        fontSize: '26px',
        color: COLORS.warnCss,
        stroke: COLORS.inkCss,
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    // 하단 추격전 — 당직 선배가 뒤에서 쫓고 기태가 앞서 도망친다.
    // 스프라이트가 왼쪽을 보고 있으므로 **오른쪽에서 왼쪽으로** 달려야 뒷걸음질처럼 보이지 않는다.
    // 즉 진행 방향 기준 '뒤'는 오른쪽이라, 선배가 기태보다 오른쪽에서 출발한다.
    // 버튼 영역(마지막 버튼 아래끝 ~1120) 아래로 내려 화면 맨 아래 띠에만 머물게 한다.
    const laneY = GAME_HEIGHT - 92;
    const runner = new Cadet(this, GAME_WIDTH + 170, laneY, 'player');
    runner.setScale(0.52).setDepth(1);
    runner.setMotion('run'); // player_run / player_run_b 2프레임 — 손발이 교차한다
    const chaser = new Cadet(this, GAME_WIDTH + 430, laneY, 'senior');
    chaser.setScale(0.54).setDepth(1);
    chaser.setMotion('run'); // senior_run / senior_run_b 2프레임
    // 선배 쪽이 조금 더 멀리 가므로 갈수록 간격이 좁혀진다
    this.tweens.add({ targets: runner, x: -230, duration: 6200, repeat: -1 });
    this.tweens.add({ targets: chaser, x: -90, duration: 6200, repeat: -1 });

    // 🥚 이스터에그 — 앞뒤 생도를 각각 몰래 두드리면 숨은 기능이 열린다.
    this.wireRunnerEasterEgg(runner, laneY);
    this.wireChaserEasterEgg(chaser, laneY);

    if (gameState.bestDay > 0) {
      this.add
        .text(GAME_WIDTH / 2, 640, `내 최고 기록: ${gameState.bestDay}일차`, {
          fontFamily: FONT,
          fontSize: '30px',
          color: COLORS.warnCss,
        })
        .setOrigin(0.5);
    }

    new Button(this, GAME_WIDTH / 2, 706, {
      label: '▶ 게임 시작',
      width: 420,
      height: 104,
      color: COLORS.accent,
      fontSize: 40,
      onClick: () => {
        gameState.newRun();
        this.scene.start('DayIntro');
      },
    });

    new Button(this, GAME_WIDTH / 2, 818, {
      label: '🏆 리더보드',
      width: 420,
      height: 92,
      onClick: () => this.toggleLeaderboard(),
    });

    new Button(this, GAME_WIDTH / 2, 918, {
      label: '📖 게임 설명',
      width: 420,
      height: 92,
      onClick: () => this.toggleHelp(),
    });

    new Button(this, GAME_WIDTH / 2, 1018, {
      label: '✏️ 닉네임 설정',
      width: 420,
      height: 92,
      onClick: () => {
        void askNickname(gameState.settings.nickname).then((name) => {
          if (name) gameState.setNickname(name);
        });
      },
    });

    // 우측 상단 소리 아이콘 — 음소거 토글 대신 '소리 설정' 패널을 연다 (역할 전환)
    addVolumeButton(this);
  }

  /**
   * 달려가는 기태(앞선 생도)를 탭 가능하게 만들고, 연속 탭을 센다.
   * 히트 영역은 컨테이너 로컬 좌표(스케일 이전) — Cadet은 발끝을 y≈120에 두고
   * 위로 ~300px 뻗으므로 몸통을 넉넉히 감싸는 사각형을 준다.
   */
  private wireRunnerEasterEgg(runner: Cadet, laneY: number): void {
    runner.setInteractive(
      new Phaser.Geom.Rectangle(-110, -200, 220, 340),
      Phaser.Geom.Rectangle.Contains
    );
    runner.on('pointerdown', () => {
      if (this.eggFiring) return;
      this.eggTaps += 1;
      vibrate(HAPTIC.damage);

      // 탭 반응 — 잠깐 튀어오른다 (원래 배율 0.52로 yoyo 복귀)
      this.tweens.add({
        targets: runner,
        scale: 0.6,
        duration: 70,
        yoyo: true,
        ease: 'Quad.easeOut',
      });

      // '연속' 판정 — 손을 오래 떼면 카운트가 끊긴다
      this.eggResetTimer?.remove();
      this.eggResetTimer = this.time.delayedCall(EGG_TAP_WINDOW_MS, () => {
        this.eggTaps = 0;
      });

      // 막판 카운트다운 힌트
      const left = EGG_TAP_GOAL - this.eggTaps;
      if (left > 0 && left <= 5) {
        speechBubble(this, runner.x, laneY - 160, `${left}!`, 450);
      }

      if (this.eggTaps >= EGG_TAP_GOAL) {
        this.eggFiring = true;
        this.eggResetTimer?.remove();
        this.eggResetTimer = null;
        void this.fireLeaderboardEasterEgg(runner);
      }
    });
  }

  /**
   * 현재 리더보드 1등을 기준으로, 일수는 그대로 두고 초만 1초 더해
   * 기태를 리더보드 맨 위(1등)에 등재한다.
   */
  private async fireLeaderboardEasterEgg(runner: Cadet): Promise<void> {
    vibrate(HAPTIC.success);
    // 전력질주 연출 — 화면 밖으로 쏜살같이 사라졌다 리셋 트윈이 다시 데려온다
    this.tweens.add({ targets: runner, x: -260, duration: 500, ease: 'Cubic.easeIn' });
    speechBubble(this, runner.x, runner.y - 160, '차는 두고 가!!', 900);

    // 등재에 쓸 닉네임 확보
    let nick = gameState.settings.nickname;
    if (!nick) {
      const chosen = await askNickname('', '1등에 오를 닉네임을 정하자 (1~12자)');
      if (chosen) {
        gameState.setNickname(chosen);
        nick = chosen;
      }
    }
    if (!this.scene.isActive()) return;
    if (!nick) {
      showToast(this, '닉네임이 있어야 1등에 등재할 수 있어', COLORS.warnCss);
      this.eggFiring = false;
      this.eggTaps = 0;
      return;
    }

    // 현재 1등을 조회 — 일수는 그대로, play_ms만 1초(1000ms) 더 얹는다
    const top = await fetchTop();
    if (!this.scene.isActive()) return;
    const first = top?.entries?.[0];
    const days = first ? first.days : 1;
    const play_ms = first ? first.play_ms + 1000 : 3000;

    const result = await submitScore({ nickname: nick, days, play_ms });
    if (!this.scene.isActive()) return;
    const secs = Math.round(play_ms / 1000);
    if (result.ok) {
      audio.chime();
      showToast(
        this,
        `🏆 ${days}일차 · ${secs}초 — ${result.rank ?? 1}위 등극!`,
        COLORS.safeCss
      );
    } else if (result.queued) {
      showToast(this, '🥚 오프라인 — 다음 접속 시 1등으로 등록돼', COLORS.warnCss);
    } else {
      showToast(this, `등재 실패: ${result.error ?? '알 수 없는 오류'}`, COLORS.accentCss);
    }
    // 다시 도전할 수 있도록 잠금 해제 (연속 카운트는 초기화)
    this.eggFiring = false;
    this.eggTaps = 0;
  }

  /**
   * 뒤쫓는 생도를 탭 가능하게 만들고 연속 탭을 센다.
   * 히트 영역은 러너와 동일한 몸통 사각형 (컨테이너 로컬, 스케일 이전).
   */
  private wireChaserEasterEgg(chaser: Cadet, laneY: number): void {
    chaser.setInteractive(
      new Phaser.Geom.Rectangle(-110, -200, 220, 340),
      Phaser.Geom.Rectangle.Contains
    );
    chaser.on('pointerdown', () => {
      if (this.chaserFiring) return;
      this.chaserTaps += 1;
      vibrate(HAPTIC.damage);

      this.tweens.add({
        targets: chaser,
        scale: 0.62,
        duration: 70,
        yoyo: true,
        ease: 'Quad.easeOut',
      });

      this.chaserResetTimer?.remove();
      this.chaserResetTimer = this.time.delayedCall(EGG_TAP_WINDOW_MS, () => {
        this.chaserTaps = 0;
      });

      const left = CHASER_TAP_GOAL - this.chaserTaps;
      if (left > 0 && left <= 3) {
        speechBubble(this, chaser.x, laneY - 160, `${left}!`, 450);
      }

      if (this.chaserTaps >= CHASER_TAP_GOAL) {
        this.chaserFiring = true;
        this.chaserResetTimer?.remove();
        this.chaserResetTimer = null;
        void this.fireEndlessRhythm(chaser);
      }
    });
  }

  /**
   * 원하는 일차 속도를 골라, 노래가 끝없이 도는 무한 리듬(벽치기) 모드로 진입한다.
   * 기록·목숨과 무관한 연습 방식으로 열고, ⏸ 메뉴로 언제든 타이틀로 돌아온다.
   */
  private async fireEndlessRhythm(chaser: Cadet): Promise<void> {
    vibrate(HAPTIC.success);
    speechBubble(this, chaser.x, chaser.y - 160, '한 곡 더!', 900);

    const defaultDay = gameState.bestDay > 0 ? gameState.bestDay : 5;
    const day = await askDay(defaultDay, '몇 일차 속도로 즐길까? (1~99)');
    if (!this.scene.isActive()) return;
    if (day == null) {
      // 취소 — 다시 시도할 수 있게 잠금 해제
      this.chaserFiring = false;
      this.chaserTaps = 0;
      return;
    }
    gameState.startPractice(day);
    this.scene.start('wallpunch', { endless: true });
  }

  private toggleHelp(): void {
    if (this.helpPanel) {
      this.helpPanel.destroy();
      this.helpPanel = null;
      return;
    }
    this.helpPanel = showHelpPanel(this, () => {
      this.helpPanel = null;
    });
  }

  private toggleLeaderboard(): void {
    if (this.lbPanel) {
      this.lbPanel.destroy();
      this.lbPanel = null;
      return;
    }
    this.lbPanel = showLeaderboardPanel(this, gameState.settings.nickname, () => {
      this.lbPanel = null;
    });
  }
}

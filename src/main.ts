import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from './config';
import { audio } from './core/AudioManager';
import { gameState } from './core/GameState';
import { BootScene } from './scenes/BootScene';
import { BaseMainScene } from './scenes/main/BaseMainScene';
import { TitleScene } from './scenes/TitleScene';
import { DayIntroScene } from './scenes/DayIntroScene';
import { PauseScene } from './scenes/PauseScene';
import { ResultScene } from './scenes/ResultScene';
import { ShowerScene } from './scenes/main/ShowerScene';
import { HallwayScene } from './scenes/main/HallwayScene';
import { MicrowaveScene } from './scenes/main/MicrowaveScene';
import { WalkScene } from './scenes/main/WalkScene';
import { WallPunchScene } from './scenes/main/WallPunchScene';
import { KakaoScene } from './scenes/mini/KakaoScene';
import { VoteScene } from './scenes/mini/VoteScene';
import { PhotoPickScene } from './scenes/mini/PhotoPickScene';

registerSW({ immediate: true });

// 카톡 인앱 브라우저면 index.html의 안내/리다이렉트만 남기고 게임을 띄우지 않는다
if ((window as unknown as { __KAKAO_INAPP__?: boolean }).__KAKAO_INAPP__) {
  throw new Error('kakao in-app browser — redirecting to external browser');
}

// 인앱 → 기본 브라우저로 넘어올 때 ?nick=으로 인계된 닉네임 수령
// (인앱과 기본 브라우저는 localStorage가 분리되어 있다)
const bootParams = new URLSearchParams(location.search);
const handedNick = bootParams.get('nick')?.trim().slice(0, 12);
if (handedNick && !gameState.settings.nickname) {
  gameState.setNickname(handedNick);
}
if (bootParams.has('nick')) {
  bootParams.delete('nick');
  const rest = bootParams.toString();
  history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : ''));
}

// 모바일 autoplay 정책: 제스처마다 오디오 컨텍스트 해제 시도.
// iOS는 백그라운드 복귀/전화 인터럽트 후 컨텍스트가 다시 잠기므로 once가 아니라 항상 건다.
audio.installAutoUnlock();
// 실음원 프리로드 — 샤워장 노래 + 물소리 + 전자레인지 (첫 제스처 후 디코드)
audio.preloadAudio();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  backgroundColor: COLORS.bg,
  physics: { default: 'arcade' },
  scene: [
    BootScene,
    TitleScene,
    DayIntroScene,
    ResultScene,
    ShowerScene,
    HallwayScene,
    MicrowaveScene,
    WalkScene,
    WallPunchScene,
    KakaoScene,
    VoteScene,
    PhotoPickScene,
    // 오버레이 씬은 마지막에 — Phaser는 이 배열 순서대로 렌더링하므로
    // 앞에 두면 게임 씬 '아래'에 깔려 보이지 않는다
    PauseScene,
  ],
});

// 개발/자동 스크린샷용 핸들 (프로덕션 동작에는 영향 없음)
(window as unknown as { __game?: Phaser.Game }).__game = game;

/**
 * 만화체 웹폰트(Jua·Poor Story)가 늦게 도착하면 Phaser가 폴백 폰트 기준으로
 * 글자 폭을 재 놓아 배경 패널과 어긋난다. 폰트가 준비되면 이미 그려진 텍스트를
 * 한 번 다시 렌더시켜 폭을 맞춘다.
 */
void document.fonts?.ready.then(() => {
  for (const scene of game.scene.getScenes(true)) {
    scene.children.each((child) => {
      if (child instanceof Phaser.GameObjects.Text) child.updateText();
    });
  }
});

// 다른 앱/탭으로 떠나면 자동 일시정지 + 생존시간 시계 정지.
// (벽시계 기반 플레이 시간이 자리를 비운 사이 불어나는 것을 막는다)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    gameState.holdClock();
    for (const scene of game.scene.getScenes(true)) {
      if (scene instanceof BaseMainScene) scene.autoPause();
    }
  } else {
    gameState.releaseClock();
    // 복귀 직후 뷰포트가 재확정되며 캔버스 크기가 틀어질 수 있다
    window.setTimeout(refreshScale, 100);
  }
});

// iOS 주소창 접힘/회전 시 뷰포트가 바뀌어도 캔버스가 잘리지 않게 재계산
const refreshScale = (): void => {
  game.scale.refresh();
};
/** 가상 키보드가 떠 있는 상태(줄어든 visualViewport)인지 — 이때 재계산하면 축소가 잔존한다 */
const keyboardOpen = (): boolean => {
  const vv = window.visualViewport;
  return !!vv && vv.height < window.innerHeight - 140;
};
window.addEventListener('resize', () => {
  if (!keyboardOpen()) refreshScale();
});
window.visualViewport?.addEventListener('resize', () => {
  if (!keyboardOpen()) refreshScale();
});
window.addEventListener('orientationchange', () => {
  // 회전 직후에는 뷰포트 값이 늦게 확정되는 기기가 있어 한 박자 뒤 한 번 더
  refreshScale();
  window.setTimeout(refreshScale, 300);
});
// 축소 잔존 감시 — 어떤 경로로든(키보드/회전/PWA 복귀) 캔버스가 #app의 FIT 기대치보다
// 작게 남아 있으면 다시 맞춘다. "화면이 꽉 안 찬다"는 축소 고착의 마지막 안전망.
window.setInterval(() => {
  if (keyboardOpen()) return;
  const app = document.getElementById('app');
  const cv = app?.querySelector('canvas');
  if (!app || !cv) return;
  const ar = app.getBoundingClientRect();
  const cr = cv.getBoundingClientRect();
  if (ar.width < 50 || ar.height < 50) return;
  const expectedW = GAME_WIDTH * Math.min(ar.width / GAME_WIDTH, ar.height / GAME_HEIGHT);
  if (Math.abs(cr.width - expectedW) > 4) refreshScale();
}, 1200);

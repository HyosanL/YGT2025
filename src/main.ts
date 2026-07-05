import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from './config';
import { audio } from './core/AudioManager';
import { gameState } from './core/GameState';
import { BootScene } from './scenes/BootScene';
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
    PauseScene,
    ResultScene,
    ShowerScene,
    HallwayScene,
    MicrowaveScene,
    WalkScene,
    WallPunchScene,
    KakaoScene,
    VoteScene,
    PhotoPickScene,
  ],
});

// iOS 주소창 접힘/가상 키보드/회전 시 뷰포트가 바뀌어도 캔버스가 잘리지 않게 재계산
const refreshScale = (): void => {
  game.scale.refresh();
};
window.visualViewport?.addEventListener('resize', refreshScale);
window.addEventListener('orientationchange', () => {
  // 회전 직후에는 뷰포트 값이 늦게 확정되는 기기가 있어 한 박자 뒤 한 번 더
  refreshScale();
  window.setTimeout(refreshScale, 300);
});

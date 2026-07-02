import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from './config';
import { audio } from './core/AudioManager';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { DayIntroScene } from './scenes/DayIntroScene';
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

// 모바일 autoplay 정책: 첫 터치에서 오디오 컨텍스트 해제
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });

new Phaser.Game({
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
  ],
});

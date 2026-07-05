import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { audio } from '../core/AudioManager';
import { gameState } from '../core/GameState';
import { Button } from './Button';

type VolKind = 'master' | 'bgm' | 'sfx';

const ROWS: Array<{ kind: VolKind; label: string }> = [
  { kind: 'master', label: '마스터' },
  { kind: 'bgm', label: '배경음악' },
  { kind: 'sfx', label: '효과음' },
];

const TRACK_X = 110;
const TRACK_W = 420;

function getVol(kind: VolKind): number {
  const s = gameState.settings;
  const v = kind === 'master' ? s.volMaster : kind === 'bgm' ? s.volBgm : s.volSfx;
  return Math.max(0, Math.min(10, Math.round(v ?? 10)));
}

/**
 * 소리 설정 패널 — 마스터/배경음악/효과음 0~10 가로 슬라이더.
 * 드래그·탭 모두 지원, 변경 즉시 반영 + 저장.
 */
export function showVolumePanel(scene: Phaser.Scene, onClose: () => void): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0).setDepth(3000);

  const dim = scene.add
    .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
    .setOrigin(0)
    .setInteractive();
  root.add(dim);

  const panelY = 330;
  const bg = scene.add.graphics();
  bg.fillStyle(COLORS.panel, 0.97);
  bg.fillRoundedRect(60, panelY, GAME_WIDTH - 120, 620, 24);
  root.add(bg);

  root.add(
    scene.add
      .text(GAME_WIDTH / 2, panelY + 64, '🔊 소리 설정', {
        fontFamily: FONT,
        fontSize: '40px',
        color: COLORS.textCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
  );

  ROWS.forEach((row, idx) => {
    const y = panelY + 180 + idx * 130;
    let value = getVol(row.kind);

    root.add(
      scene.add.text(TRACK_X, y - 58, row.label, {
        fontFamily: FONT,
        fontSize: '26px',
        color: COLORS.subCss,
      })
    );
    const valueText = scene.add
      .text(TRACK_X + TRACK_W + 60, y, '', {
        fontFamily: FONT,
        fontSize: '34px',
        color: COLORS.textCss,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    root.add(valueText);

    // 트랙 배경
    const trackBg = scene.add.graphics();
    trackBg.fillStyle(0x000000, 0.55);
    trackBg.fillRoundedRect(TRACK_X, y - 9, TRACK_W, 18, 9);
    root.add(trackBg);

    // 채움 + 노브
    const fill = scene.add.graphics();
    root.add(fill);
    const knob = scene.add.circle(0, y, 24, 0xf5f5f5).setStrokeStyle(3, 0x9aa3bd);
    root.add(knob);

    const render = (): void => {
      fill.clear();
      fill.fillStyle(COLORS.accent, 1);
      fill.fillRoundedRect(TRACK_X, y - 9, (TRACK_W * value) / 10, 18, 9);
      knob.setX(TRACK_X + (TRACK_W * value) / 10);
      valueText.setText(`${value}`);
    };

    const setFromX = (worldX: number): void => {
      const next = Math.max(
        0,
        Math.min(10, Math.round(((worldX - TRACK_X) / TRACK_W) * 10))
      );
      if (next === value) return;
      value = next;
      gameState.setVolume(row.kind, value);
      audio.applyVolumes();
      audio.tick(); // 바뀐 크기를 바로 귀로 확인
      render();
    };

    // 트랙 탭 → 즉시 점프
    const hit = scene.add
      .zone(TRACK_X - 20, y - 34, TRACK_W + 40, 68)
      .setOrigin(0)
      .setInteractive();
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => setFromX(p.x));
    root.add(hit);

    // 노브 드래그
    knob.setInteractive({ useHandCursor: true, draggable: true });
    knob.on('drag', (_p: Phaser.Input.Pointer, dragX: number) => setFromX(dragX));

    render();
  });

  const closeBtn = new Button(scene, GAME_WIDTH / 2, panelY + 545, {
    label: '닫기',
    width: 280,
    height: 86,
    onClick: () => {
      root.destroy();
      onClose();
    },
  });
  root.add(closeBtn);

  return root;
}

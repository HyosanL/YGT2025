import Phaser from 'phaser';
import { FONT, GAME_WIDTH, M3_PHOTO } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import type { LockerFlaw } from '../../types';
import { chance, pick, randInt, shuffle } from '../../utils/rng';
import { BaseMiniScene, KAKAO, PANEL } from './BaseMiniScene';

const FLAWS: LockerFlaw[] = ['tilt-blanket', 'open-drawer', 'sock', 'crooked-hanger'];

interface LockerResult {
  container: Phaser.GameObjects.Container;
  flawRect: Phaser.Geom.Rectangle | null;
}

/**
 * M3. 단체 채팅방 사진 고르기.
 * 고르기 모드: 사진 N장 중 제대로 정리된 옷장 1장 터치 (3초)
 * 틀린그림찾기 모드: 사진 1장에서 잘못된 부분을 직접 터치 (5초)
 * 옷장 일러스트는 절차 생성 — 카톡 캡처 제공 시 교체 가능.
 */
export class PhotoPickScene extends BaseMiniScene {
  constructor() {
    super({ key: 'photo' });
  }

  create(): void {
    this.setupOverlay(M3_PHOTO.roomTitle, 'kakao');
    audio.ding();

    // 옹성오 선배의 분노 메시지 (아바타 + 이름 + 좌측 흰 버블)
    const msgY = PANEL.y + 232;
    const avatar = this.add.graphics();
    avatar.fillStyle(0x5a6b7e, 1);
    avatar.fillRoundedRect(PANEL.x + 34, msgY - 32, 60, 60, 22);
    this.add
      .text(PANEL.x + 64, msgY - 2, '😡', { fontFamily: FONT, fontSize: '30px' })
      .setOrigin(0.5);
    this.add
      .text(PANEL.x + 108, msgY - 50, '옹성오', {
        fontFamily: FONT,
        fontSize: '21px',
        color: KAKAO.sub,
      })
      .setOrigin(0, 0.5);
    const bubble = this.add.graphics();
    bubble.fillStyle(KAKAO.bubbleWhite, 1);
    bubble.fillRoundedRect(PANEL.x + 108, msgY - 26, PANEL.w - 168, 58, 16);
    bubble.fillTriangle(
      PANEL.x + 108,
      msgY - 18,
      PANEL.x + 96,
      msgY - 6,
      PANEL.x + 108,
      msgY + 6
    );
    this.add
      .text(PANEL.x + 108 + (PANEL.w - 168) / 2, msgY + 3, M3_PHOTO.seniorMsg, {
        fontFamily: FONT,
        fontSize: '25px',
        color: KAKAO.textDark,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const spotMode = chance(0.5);
    if (spotMode) {
      this.createSpotMode();
    } else {
      this.createChooseMode();
    }
  }

  // ── 고르기 모드 ──────────────────────────────

  private createChooseMode(): void {
    this.add
      .text(GAME_WIDTH / 2, PANEL.y + 300, `👉 ${M3_PHOTO.chooseInstruction}`, {
        fontFamily: FONT,
        fontSize: '30px',
        color: '#c2410c',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const count = M3_PHOTO.chooseCount(gameState.day);
    const correctIndex = randInt(0, count - 1);
    const flawPool = shuffle(FLAWS);

    const cols = 2;
    const rows = Math.ceil(count / cols);
    const scale = rows >= 3 ? 0.46 : 0.6;
    const cellH = rows >= 3 ? 225 : 310;
    const startY = PANEL.y + 340 + (rows >= 3 ? 110 : 160);

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = GAME_WIDTH / 2 + (col === 0 ? -160 : 160);
      const y = startY + row * cellH;
      const flaw = i === correctIndex ? null : (flawPool[i % flawPool.length] ?? pick(FLAWS));
      const { container } = this.drawLocker(x, y, scale, flaw);

      // 사진 프레임 + 번호
      const frame = this.add.graphics();
      frame.lineStyle(4, 0xffffff, 0.9);
      frame.strokeRoundedRect(x - 118 * scale - 6, y - 178 * scale - 6, 236 * scale + 12, 356 * scale + 12, 8);
      this.add
        .text(x - 118 * scale, y - 178 * scale - 28, `${i + 1}`, {
          fontFamily: FONT,
          fontSize: '28px',
          color: KAKAO.sub,
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5);

      container.setInteractive(
        new Phaser.Geom.Rectangle(-118, -178, 236, 356),
        Phaser.Geom.Rectangle.Contains
      );
      container.on('pointerdown', () => {
        if (this.done) return;
        if (i === correctIndex) {
          this.finishSuccess('정답! "그래, 이렇게 하라고."');
        } else {
          this.finishFail('엉망인 옷장을 골라버렸다... "눈이 없냐?"');
        }
      });
    }

    this.startTimer(M3_PHOTO.chooseTimeMs, () =>
      this.finishFail('머뭇거리다 시간이 끝났다... "대답 안 하냐?"')
    );
  }

  // ── 틀린그림찾기 모드 ────────────────────────

  private createSpotMode(): void {
    this.add
      .text(GAME_WIDTH / 2, PANEL.y + 300, `👉 ${M3_PHOTO.spotInstruction}`, {
        fontFamily: FONT,
        fontSize: '30px',
        color: '#c2410c',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const flaw = pick(FLAWS);
    const cx = GAME_WIDTH / 2;
    const cy = PANEL.y + 665;
    const scale = 1.5;
    const { flawRect } = this.drawLocker(cx, cy, scale, flaw);

    const frame = this.add.graphics();
    frame.lineStyle(5, 0xffffff, 0.9);
    frame.strokeRoundedRect(cx - 118 * scale - 8, cy - 178 * scale - 8, 236 * scale + 16, 356 * scale + 16, 10);

    // 사진 전체를 탭 영역으로 — 틀린 부분이면 성공, 아니면 실패
    const zone = this.add
      .zone(cx, cy, 236 * scale, 356 * scale)
      .setOrigin(0.5)
      .setInteractive();
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.done || !flawRect) return;
      const localX = (pointer.x - cx) / scale;
      const localY = (pointer.y - cy) / scale;
      if (flawRect.contains(localX, localY)) {
        this.finishSuccess('발견! "그래, 그거 당장 고쳐."');
      } else {
        this.finishFail('엉뚱한 곳을 짚었다... "장난하냐고 물었다?"');
      }
    });

    this.startTimer(M3_PHOTO.spotTimeMs, () =>
      this.finishFail('잘못된 부분을 못 찾았다... "너 눈 감고 다니냐?"')
    );
  }

  // ── 옷장 절차 생성 ─────────────────────────

  private drawLocker(x: number, y: number, scale: number, flaw: LockerFlaw | null): LockerResult {
    const c = this.add.container(x, y).setScale(scale);
    const key =
      flaw === 'tilt-blanket'
        ? 'locker_tilt'
        : flaw === 'open-drawer'
          ? 'locker_drawer'
          : flaw === 'sock'
            ? 'locker_sock'
            : flaw === 'crooked-hanger'
              ? 'locker_hanger'
              : 'locker_ok';
    c.add(this.add.image(0, 0, key).setOrigin(0.5).setDisplaySize(236, 356));

    // 틀린 부분 히트 영역 (이미지 로컬 좌표, 236x356 기준 근사)
    let flawRect: Phaser.Geom.Rectangle | null = null;
    switch (flaw) {
      case 'tilt-blanket':
        flawRect = new Phaser.Geom.Rectangle(-118, -178, 236, 96);
        break;
      case 'crooked-hanger':
        flawRect = new Phaser.Geom.Rectangle(-110, -86, 170, 150);
        break;
      case 'open-drawer':
        flawRect = new Phaser.Geom.Rectangle(-118, 36, 236, 140);
        break;
      case 'sock':
        flawRect = new Phaser.Geom.Rectangle(-70, 24, 170, 120);
        break;
      case null:
        break;
    }

    return { container: c, flawRect };
  }
}

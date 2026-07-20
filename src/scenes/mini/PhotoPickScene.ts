import Phaser from 'phaser';
import { FONT, GAME_WIDTH, M3_PHOTO } from '../../config';
import { audio } from '../../core/AudioManager';
import { gameState } from '../../core/GameState';
import type { LockerFlaw } from '../../types';
import { chance, pick, randInt, shuffle } from '../../utils/rng';
import { drawIncoming } from '../../ui/kakao';
import { BaseMiniScene, KAKAO, PANEL } from './BaseMiniScene';

const FLAWS: LockerFlaw[] = ['tilt-cap', 'open-drawer', 'sock', 'crooked-hanger'];

/** 옷장 그림의 표시 규격 — 에셋 원본 비율(452:512)을 그대로 지킨다 (찌그러지면 히트영역도 어긋난다) */
const LOCKER_W = 236;
const LOCKER_H = 267;

/**
 * 흠집별 텍스처 키와 '틀린 부분'의 히트영역.
 *
 * 히트영역은 눈대중이 아니라 **정답 컷과 흠집 컷을 픽셀 차분해 실측**한 값이다
 * (scratchpad/lockerdiff.cjs). 예전에는 대충 적은 사각형이라 제대로 짚어도 오답이 났다.
 * 좌표계는 컨테이너 중심 기준, LOCKER_W×LOCKER_H 규격.
 */
const FLAW_SPEC: Record<LockerFlaw, { key: string; rect: [number, number, number, number] }> = {
  'tilt-cap': { key: 'locker_tilt', rect: [-56, -125, 90, 90] },
  'open-drawer': { key: 'locker_drawer', rect: [-100, 56, 106, 78] },
  sock: { key: 'locker_sock', rect: [-10, 42, 90, 90] },
  'crooked-hanger': { key: 'locker_hanger', rect: [-45, -44, 90, 98] },
};

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
  /** 선배 메시지 말풍선이 끝나는 y — 사진은 그 아래에 붙는다 */
  private msgBottom = 0;

  constructor() {
    super({ key: 'photo' });
  }

  create(): void {
    this.roomMemberCount = 214;
    this.roomPlaceholder = '메시지 입력';
    this.setupOverlay(M3_PHOTO.roomTitle, 'kakao');
    audio.ding();

    // 옹성오 선배의 분노 메시지 (프로필 + 이름 + 흰 말풍선)
    this.msgBottom =
      this.room.top +
      drawIncoming(this, {
        x: PANEL.x + 24,
        y: this.room.top,
        name: '옹성오',
        avatarKey: 'avatar_ong',
        avatarEmoji: '😡',
        text: M3_PHOTO.seniorMsg,
        maxWidth: 400,
        fontSize: 25,
        bold: true,
        time: '오후 10:11',
      });

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
      .text(GAME_WIDTH / 2, this.msgBottom + 16, `👉 ${M3_PHOTO.chooseInstruction}`, {
        fontFamily: FONT,
        fontSize: '29px',
        color: '#a63a10',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const count = M3_PHOTO.chooseCount(gameState.day);
    const correctIndex = randInt(0, count - 1);
    const flawPool = shuffle(FLAWS);

    const cols = 2;
    const rows = Math.ceil(count / cols);
    const scale = rows >= 3 ? 0.46 : 0.6;
    const cellH = rows >= 3 ? 168 : 250;
    const startY = this.msgBottom + (rows >= 3 ? 92 : 120) + (rows >= 3 ? 82 : 107);

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
      frame.strokeRoundedRect(
        x - (LOCKER_W / 2) * scale - 6,
        y - (LOCKER_H / 2) * scale - 6,
        LOCKER_W * scale + 12,
        LOCKER_H * scale + 12,
        8
      );
      this.add
        .text(x - (LOCKER_W / 2) * scale, y - (LOCKER_H / 2) * scale - 28, `${i + 1}`, {
          fontFamily: FONT,
          fontSize: '28px',
          color: KAKAO.sub,
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5);

      container.setInteractive(
        new Phaser.Geom.Rectangle(-LOCKER_W / 2, -LOCKER_H / 2, LOCKER_W, LOCKER_H),
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
      .text(GAME_WIDTH / 2, this.msgBottom + 16, `👉 ${M3_PHOTO.spotInstruction}`, {
        fontFamily: FONT,
        fontSize: '29px',
        color: '#a63a10',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const flaw = pick(FLAWS);
    const scale = 1.35;
    const cx = GAME_WIDTH / 2;
    const cy = this.msgBottom + 46 + (LOCKER_H * scale) / 2;
    const { flawRect } = this.drawLocker(cx, cy, scale, flaw);

    const frame = this.add.graphics();
    frame.lineStyle(5, 0xffffff, 0.9);
    frame.strokeRoundedRect(
      cx - (LOCKER_W / 2) * scale - 8,
      cy - (LOCKER_H / 2) * scale - 8,
      LOCKER_W * scale + 16,
      LOCKER_H * scale + 16,
      10
    );

    // 사진 전체를 탭 영역으로 — 틀린 부분이면 성공, 아니면 실패
    const zone = this.add
      .zone(cx, cy, LOCKER_W * scale, LOCKER_H * scale)
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

  // ── 옷장 그리기 ─────────────────────────────

  private drawLocker(x: number, y: number, scale: number, flaw: LockerFlaw | null): LockerResult {
    const c = this.add.container(x, y).setScale(scale);
    const key = flaw ? FLAW_SPEC[flaw].key : 'locker_ok';
    c.add(this.add.image(0, 0, key).setOrigin(0.5).setDisplaySize(LOCKER_W, LOCKER_H));

    const r = flaw ? FLAW_SPEC[flaw].rect : null;
    return {
      container: c,
      flawRect: r ? new Phaser.Geom.Rectangle(r[0], r[1], r[2], r[3]) : null,
    };
  }
}

import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH, Q2_HALLWAY } from '../../config';
import { audio } from '../../core/AudioManager';
import { Button } from '../../ui/Button';
import { Cadet, speechBubble, type CadetStyle } from '../../ui/Characters';
import { addSceneBg } from '../../ui/Scenery';
import { chance, randFloat, randRange } from '../../utils/rng';
import { BaseMainScene } from './BaseMainScene';

type VisitorKind = 'junior' | 'peer' | 'senior';
type CycleState = 'idle' | 'approaching' | 'waiting' | 'resolved';

/** 문가 감시 선배가 나타나는 좌/우 지점 */
const WATCHER_RIGHT_X = GAME_WIDTH - 115;
const WATCHER_LEFT_X = 115;

/** 학년 티(파이핑 색·완장·모자 크기·체격·표정)를 지운 공통 근무복 룩 — 판별 단서는 견장 줄 수뿐 */
const NEUTRAL_STYLE: Partial<CadetStyle> = {
  uniform: 0x223154,
  uniformDark: 0x18233d,
  trousers: 0x1b2540,
  shoe: 0x14141c,
  cap: 0x1c2946,
  capBand: 0xffd700,
  skin: 0xffdcb8,
  hair: 0x241c14,
  scale: 1.0,
  face: '😐',
  armband: false,
  bigCap: false,
};

const RANK_OF: Record<VisitorKind, number> = { junior: 1, peer: 2, senior: 3 };

/**
 * Q2. 복도 인사/경례 판별 — 사람이 빠른 템포로 다가온다.
 * 견장 줄 수(1=후배, 2=동기, 3=선배)를 보고 제한시간 안에 올바른 응대를 골라야 한다:
 * - 후배: 🙇 인사 = 카운트 / 🫡 경례 = 굴욕 HP / 무시 = HP
 * - 동기: 🙇 인사 = 통과 / 🫡 경례 = 쪽팔림 HP / 무시 = HP
 * - 선배: 🫡 경례 = 통과 / 🙇 인사·무시 = 그 자리에서 게임 오버
 * 후배는 도착하며 먼저 경례("필승!")하지만, 동기와 선배는 무표정 — 견장이 유일한 단서다.
 *
 * 여기에 문가 감시 선배가 예고 없이 좌/우 문에 나타난다:
 * 그가 보고 있는 동안 후배 인사(까딱)를 하면 그 자리에서 발각 — 경례로 버텨야 한다.
 */
export class HallwayScene extends BaseMainScene {
  private cycleState: CycleState = 'idle';
  private visitor: Cadet | null = null;
  private visitorKind: VisitorKind = 'junior';
  private badge: Phaser.GameObjects.Container | null = null;
  private count = 0;
  private target = 3;
  private responseRemainMs = 0;
  private responseTotalMs = 1;
  private responseTimeout: Phaser.Time.TimerEvent | null = null;
  private watcherVisible = false;
  private watcherEnterMs = 0;

  private watcher!: Cadet;
  private countText!: Phaser.GameObjects.Text;
  private windowFill!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'hallway' });
  }

  create(): void {
    this.cycleState = 'idle';
    this.visitor = null;
    this.badge = null;
    this.count = 0;
    this.responseRemainMs = 0;
    this.responseTimeout = null;
    this.watcherVisible = false;

    // 생활관 복도 배경 (실제 사진 기반)
    addSceneBg(this, 'bg_hallway');

    this.countText = this.add
      .text(GAME_WIDTH / 2, 90, '', {
        fontFamily: FONT,
        fontSize: '40px',
        color: COLORS.textCss,
        fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: { x: 24, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(10);

    // 응답 시간 바
    const wBg = this.add.graphics();
    wBg.fillStyle(0x000000, 0.5);
    wBg.fillRoundedRect(GAME_WIDTH / 2 - 180, GAME_HEIGHT - 330, 360, 24, 8);
    this.windowFill = this.add.graphics();

    // 조작 버튼
    new Button(this, GAME_WIDTH / 2 - 165, GAME_HEIGHT - 190, {
      label: '🙇 인사로 받기',
      width: 310,
      height: 130,
      color: COLORS.accent,
      fontSize: 34,
      onClick: () => this.resolveAction('greet'),
    });
    new Button(this, GAME_WIDTH / 2 + 165, GAME_HEIGHT - 190, {
      label: '🫡 경례하기',
      width: 310,
      height: 130,
      color: COLORS.panelLight,
      fontSize: 34,
      onClick: () => this.resolveAction('salute'),
    });
    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT - 90,
        '견장 1줄 후배·2줄 동기 → 🙇 인사  /  3줄 선배 → 🫡 경례\n문가에 선배가 보이면 후배 인사 금지 — 경례로 버텨라!',
        {
          fontFamily: FONT,
          fontSize: '24px',
          color: COLORS.subCss,
          align: 'center',
          lineSpacing: 6,
        }
      )
      .setOrigin(0.5);

    // 문가 감시 선배 (진짜 3학년 룩 — 접근자들과 확실히 구분된다)
    this.watcher = new Cadet(this, WATCHER_RIGHT_X, 500, 'senior');
    this.watcher.setScale(0.8).setVisible(false).setDepth(6);

    this.setupCommon();
    this.target = Q2_HALLWAY.targetCount(this.day);
    this.responseTotalMs = Q2_HALLWAY.responseMs(this.day);
    this.updateCountText();

    this.time.delayedCall(400, () => this.spawnNext());

    // 감시 선배 등장/퇴장 루프 — 보고 있는 동안 후배 인사(까딱)는 발각
    this.startSeniorLoop({
      params: () => ({
        gapMs: randRange(Q2_HALLWAY.watcherGapMsRange(this.day)),
        stayMs: randRange(Q2_HALLWAY.watcherStayMsRange(this.day)),
      }),
      onEnter: () => {
        this.watcherVisible = true;
        this.watcherEnterMs = this.time.now;
        // 좌/우 문 무작위 + 매번 거리감(크기)이 다르다
        const scale = randFloat(0.7, 0.95);
        const baseX = chance(0.5) ? WATCHER_RIGHT_X : WATCHER_LEFT_X;
        this.watcher
          .setPosition(baseX + randFloat(-18, 18), 500 + Math.round((scale - 0.8) * 160))
          .setScale(scale);
        this.watcher.setVisible(true);
        this.watcher.setFace('👀');
      },
      onLeave: () => {
        this.watcherVisible = false;
        this.watcher.setVisible(false);
      },
    });
  }

  private updateCountText(): void {
    this.countText.setText(`인사 성공 ${this.count} / ${this.target}`);
  }

  // ── 방문자 사이클 ─────────────────────────────

  private pickKind(): VisitorKind {
    const seniorP = Q2_HALLWAY.seniorShare(this.day);
    const roll = Math.random();
    if (roll < seniorP) return 'senior';
    if (roll < seniorP + Q2_HALLWAY.peerShare) return 'peer';
    return 'junior';
  }

  private spawnNext(): void {
    if (this.finished) return;
    this.visitorKind = this.pickKind();
    this.cycleState = 'approaching';

    // 좌/우 문에서 번갈아 나와 중앙으로 접근 (얼굴·근무복 동일, 견장 줄 수만 단서)
    const side = this.count % 2 === 0 ? -1 : 1;
    const v = new Cadet(this, GAME_WIDTH / 2 + side * 160, 470, this.visitorKind, false, {
      ...NEUTRAL_STYLE,
      visitorRank: RANK_OF[this.visitorKind] as 1 | 2 | 3,
    });
    v.setScale(0.4).setAlpha(0.9).setDepth(5);
    v.setMotion('walk');
    this.visitor = v;
    this.badge = this.buildRankBadge(RANK_OF[this.visitorKind]);

    this.tweens.add({
      targets: v,
      x: GAME_WIDTH / 2,
      y: 700,
      scale: 1,
      alpha: 1,
      duration: Q2_HALLWAY.approachMs(this.day),
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (this.finished || this.cycleState !== 'approaching') return;
        this.onArrive();
      },
    });
  }

  private onArrive(): void {
    this.cycleState = 'waiting';
    const v = this.visitor;
    if (!v) return;
    if (this.visitorKind === 'junior') {
      // 후배는 먼저 경례한다 — 유일하게 행동으로 티가 나는 상대
      v.setFace('🫡');
      v.setMotion('salute');
      speechBubble(this, GAME_WIDTH / 2, 500, '필승!');
      audio.chime();
    } else {
      // 동기/선배는 무표정으로 응대를 기다린다 — 견장을 읽어라
      v.setMotion('idle');
    }
    this.responseRemainMs = this.responseTotalMs;
    this.responseTimeout = this.time.delayedCall(this.responseTotalMs, () => {
      if (this.finished || this.cycleState !== 'waiting') return;
      this.resolveAction('timeout');
    });
  }

  /** 인사/경례/타임아웃 판정 — 접근 중 선응대도 허용 (빠른 템포) */
  private resolveAction(action: 'greet' | 'salute' | 'timeout'): void {
    if (this.finished) return;
    if (this.cycleState !== 'approaching' && this.cycleState !== 'waiting') return;
    const v = this.visitor;
    if (!v) return;
    this.cycleState = 'resolved';
    this.responseTimeout?.remove();
    this.responseTimeout = null;
    this.tweens.killTweensOf(v);
    this.windowFill.clear();

    const kind = this.visitorKind;

    if (kind === 'senior') {
      this.badge?.destroy();
      this.badge = null;
      if (action === 'salute') {
        audio.chime();
        v.setFace('😌');
        speechBubble(this, GAME_WIDTH / 2, 500, '음, 군기 좋다.', 800);
        this.finishCycle(v);
      } else if (action === 'greet') {
        v.setFace('😡');
        this.failCaught(v, '3학년 선배의 발걸음을 고개 까딱으로 받아버렸다...', '너 지금 뭐 했냐?');
      } else {
        v.setFace('😡');
        this.failCaught(v, '선배를 못 본 척 지나쳤다... 그 자리에서 잡혀갔다.', '일로 와봐.');
      }
      return;
    }

    if (kind === 'peer') {
      if (action === 'greet') {
        v.setFace('🙂');
        speechBubble(this, GAME_WIDTH / 2, 500, 'ㅇㅋ~', 700);
      } else if (action === 'salute') {
        v.setFace('😆');
        speechBubble(this, GAME_WIDTH / 2, 500, '풉 ㅋㅋ 왜 경례함?', 900);
        this.applyDamage(Q2_HALLWAY.hpSalutePeer, '동기한테 경례해버렸다... 개쪽팔림');
      } else {
        v.setFace('😒');
        this.applyDamage(Q2_HALLWAY.hpTimeout, '동기를 못 본 척했다... 어색해졌다');
      }
      this.finishCycle(v);
      return;
    }

    // junior
    if (action === 'greet') {
      // 문가 선배가 보고 있으면 발각 — 등장 직후 280ms는 세이프
      // (탭을 이미 결심한 순간 나타난 '대응 불가능한 즉사' 방지)
      if (this.watcherVisible && this.time.now - this.watcherEnterMs > 280) {
        this.badge?.destroy();
        this.badge = null;
        this.failCaught(
          this.watcher,
          '후배 경례를 까딱으로 받는 순간, 문가의 선배와 눈이 마주쳤다.',
          '너 지금 뭐 했냐?'
        );
        return;
      }
      this.count += 1;
      this.updateCountText();
      audio.chime();
      speechBubble(this, GAME_WIDTH / 2, GAME_HEIGHT - 360, '받았으~', 900);
      v.setFace('😳');
      if (this.count >= this.target) {
        this.finishCycle(v, true);
        this.succeed('오늘의 어깨힘주기 할당량을 채웠다!');
        return;
      }
    } else if (action === 'salute') {
      if (this.watcherVisible) {
        // 선배가 보는 앞이라 각 잡고 경례 — 정석 대응, 카운트만 없다
        v.setFace('🫡');
        speechBubble(this, GAME_WIDTH / 2, 500, '(선배 앞이라 각 잡았다)', 800);
      } else {
        v.setFace('😳');
        speechBubble(this, GAME_WIDTH / 2, 500, '(어라...?)', 900);
        this.applyDamage(Q2_HALLWAY.hpSaluteJunior, '후배한테 경례로 받아버렸다... 체면 대실추!');
      }
    } else {
      v.setFace('😒');
      this.applyDamage(Q2_HALLWAY.hpTimeout, '후배 경례를 무시했다... 건방지다고 소문났다');
    }
    this.finishCycle(v);
  }

  private finishCycle(v: Cadet, last = false): void {
    this.badge?.destroy();
    this.badge = null;
    this.visitor = null;
    v.setMotion('walk');
    this.tweens.add({
      targets: v,
      y: 1050,
      alpha: 0,
      duration: 500,
      onComplete: () => v.destroy(),
    });
    if (last || this.finished || this.count >= this.target) return;
    this.time.delayedCall(randRange(Q2_HALLWAY.gapMsRange(this.day)), () => this.spawnNext());
  }

  /** 견장 확대 배지 — 줄 수를 크게 보여준다 (모바일 판독용) */
  private buildRankBadge(rank: number): Phaser.GameObjects.Container {
    const c = this.add.container(GAME_WIDTH / 2, 380).setDepth(8);
    const g = this.add.graphics();
    g.fillStyle(0x101624, 0.92);
    g.fillRoundedRect(-66, -32, 132, 64, 12);
    g.lineStyle(2, 0xffd700, 0.8);
    g.strokeRoundedRect(-66, -32, 132, 64, 12);
    // 견장판
    g.fillStyle(0x2b3350, 1);
    g.fillRoundedRect(-54, -16, 108, 32, 6);
    // 학년 막대
    g.fillStyle(0xffd700, 1);
    const w = 14;
    const gap = 10;
    const total = rank * w + (rank - 1) * gap;
    for (let i = 0; i < rank; i++) {
      g.fillRect(-total / 2 + i * (w + gap), -11, w, 22);
    }
    c.add(g);
    return c;
  }

  protected tick(delta: number): void {
    // 견장 배지가 방문자 머리 위를 따라다닌다
    if (this.badge && this.visitor) {
      this.badge.setPosition(this.visitor.x, this.visitor.y - this.visitor.scale * 230);
    }
    if (this.cycleState === 'waiting') {
      this.responseRemainMs = Math.max(0, this.responseRemainMs - delta);
      const ratio = this.responseRemainMs / this.responseTotalMs;
      this.windowFill.clear();
      this.windowFill.fillStyle(ratio < 0.35 ? COLORS.accent : COLORS.safe, 1);
      this.windowFill.fillRoundedRect(
        GAME_WIDTH / 2 - 174,
        GAME_HEIGHT - 326,
        348 * ratio,
        16,
        5
      );
    }
  }
}

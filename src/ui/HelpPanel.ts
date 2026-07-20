import Phaser from 'phaser';
import { COLORS, FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { gameState } from '../core/GameState';
import { Button } from './Button';

interface HelpTopic {
  icon: string;
  title: string;
  body: string;
  /** 연습 가능한 퀘스트 — 씬 키와 실행 방식 */
  practice?: { key: string; kind: 'main' | 'mini' };
}

interface HelpSection {
  label: string;
  topics: HelpTopic[];
}

/** 조작법 중심 — 읽고 바로 플레이할 수 있게 */
const SECTIONS: HelpSection[] = [
  {
    label: '기본',
    topics: [
      {
        icon: '🎯',
        title: '기본 규칙',
        body:
          '공사 2학년 생도로 하루하루 버티는 게임이다.\n\n' +
          '· 하루에 퀘스트 1개 — 깨면 다음 날로\n' +
          '· 선배에게 걸리면 그 자리에서 사망 (목숨 소모)\n' +
          '· HP는 매일 아침 100으로 회복, 0이 되면 쓰러진다\n' +
          '· 일차가 오를수록 모든 게 빨라지고 어려워진다\n' +
          '· 우상단 ⏸ = 일시정지 (다른 앱을 갔다 와도 자동 일시정지)\n' +
          '· 랭킹: 일차 높은 순 → 같은 일차면 오래 버틴 순',
      },
      {
        icon: '❤️',
        title: '목숨과 부활',
        body:
          '목숨은 최대 3칸, 시작은 1칸.\n\n' +
          '· 죽으면 목숨 1칸을 쓰고 그 날 아침부터 부활\n' +
          '· 단, 쓰고 나서도 온전한 하트 1개가 남아 있어야 부활\n' +
          '· 모자라면 그대로 게임 오버\n\n' +
          '채우는 법: 미니 퀘스트 성공 = ⅕칸 · 벽치기 성공 = 1칸\n' +
          '깎이는 법: 미니 퀘스트 실패 = 1칸! (0이 되면 즉시 끝)',
      },
    ],
  },
  {
    label: '메인 퀘스트 (하루 1개)',
    topics: [
      {
        icon: '🚿',
        title: '샤워장 노래',
        practice: { key: 'shower', kind: 'main' },
        body:
          '몰래 노래를 틀고 끝까지 듣는 게 목표.\n\n' +
          '· 노래는 자동 재생 — 빨간 게이지가 다 차면 성공\n' +
          '· 선배가 문이나 옆 칸에서 예고 없이 나타난다!\n' +
          '· 나타나는 순간 [⏸ 숨죽이기]를 꾹 — 나갈 때까지 유지\n' +
          '· 파란 샤워 시간이 다 되기 전에 끝내야 한다',
      },
      {
        icon: '🫡',
        title: '복도 인사',
        practice: { key: 'hallway', kind: 'main' },
        body:
          '다가오는 사람의 견장 줄 수를 보고 응대해라.\n\n' +
          '· 1줄 후배 → 🙇 인사 (이것만 카운트!)\n' +
          '· 2줄 동기 → 🙇 인사 (경례하면 쪽팔림)\n' +
          '· 3줄 선배 → 🫡 경례 (인사하거나 무시하면 즉시 끝)\n' +
          '· 아무도 먼저 인사·경례하지 않는다 — 견장이 유일한 단서\n' +
          '· 제한시간 안에 응대하지 않으면 HP 감소',
      },
      {
        icon: '🍜',
        title: '전자레인지',
        practice: { key: 'microwave', kind: 'main' },
        body:
          '소등 전에 몰래 라면을 완성해라.\n\n' +
          '· 전자레인지 앞에 서 있으면 조리 진행 (불빛 + 소리)\n' +
          '· 선배가 복도에 나타나면 [🫣 숨기]를 꾹\n' +
          '· 선배가 가면 손을 떼고 이어서 조리\n' +
          '· 🌙 소등 카운트다운이 끝나기 전에 100%를 채우면 성공',
      },
      {
        icon: '🥋',
        title: '무도장 가기',
        practice: { key: 'walk', kind: 'main' },
        body:
          '위에서 내려다보는 길 — 선배들의 시선을 피해 도착해라.\n\n' +
          '· 평소엔 걷는다 (HP 회복)\n' +
          '· 화면을 꾹 누르면 구보 (빠르지만 HP 소모)\n' +
          '· 시야(부채꼴)에 걸린 채 걸으면 발각 —\n' +
          '  빨간 시야에 들어갔다면 무조건 뛰어라!\n' +
          '· HP가 바닥나면 탈진해서 한동안 못 뛴다',
      },
      {
        icon: '💥',
        title: '벽치기 (도박)',
        practice: { key: 'wallpunch', kind: 'main' },
        body:
          '옆방 1학년들이 시끄럽다. 선택해라.\n\n' +
          '· [👊 벽 치기] = 도박\n' +
          '  무사하면 조용해지고 ❤️ 목숨 +1칸!\n' +
          '  하지만 벽 너머에 선배가 있었다면... 즉사\n' +
          '· [😪 참고 잔다] = 안전하게 하루 종료 (보상 없음)\n' +
          '· 일차가 오를수록 선배가 있을 확률이 올라간다',
      },
    ],
  },
  {
    label: '미니 퀘스트 (불시에 카톡이 온다)',
    topics: [
      {
        icon: '💬',
        title: '카톡 답장',
        practice: { key: 'kakao', kind: 'mini' },
        body:
          '선배의 카톡이 왔다. 늦으면 끝장.\n\n' +
          '· 노란 문장을 토씨 하나 안 틀리고 입력해라\n' +
          '  (마지막 느낌표까지!)\n' +
          '· 입력창을 탭하면 키보드가 올라온다\n' +
          '· 문장이 완성되면 자동 전송 — 오타 채로 보내면 실패',
      },
      {
        icon: '📊',
        title: '투표',
        practice: { key: 'vote', kind: 'mini' },
        body:
          '옹성오의 지시를 읽고 설문에 답해라.\n\n' +
          '· 꼬인 문장(이중·삼중 부정) 중 의미가 맞는 선지 선택\n' +
          '· 예: "졸지 않았다고 하기는 어렵지 않다"\n' +
          '  → 졸지 않았다는 뜻 (정답)\n' +
          '· 함정을 고르거나 시간이 끝나면 실패',
      },
      {
        icon: '📸',
        title: '사진 고르기',
        practice: { key: 'photo', kind: 'mini' },
        body:
          '단체방에 옷장 검사 사진이 올라왔다.\n\n' +
          '· 고르기 모드: 제대로 정리된 옷장 1장을 터치\n' +
          '· 틀린그림 모드: 사진에서 잘못된 부분을 직접 터치\n' +
          '· 침구 각·서랍·양말·옷걸이를 빠르게 훑어라',
      },
    ],
  },
];

/**
 * 게임 설명 패널 — 목록(주제 선택) ↔ 상세 두 화면.
 * 기본 규칙 / 메인 퀘스트별 / 미니 퀘스트별로 골라 읽을 수 있다.
 */
export function showHelpPanel(scene: Phaser.Scene, onClose: () => void): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0).setDepth(3000);

  const dim = scene.add
    .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
    .setOrigin(0)
    .setInteractive();
  root.add(dim);

  const bg = scene.add.graphics();
  bg.fillStyle(COLORS.panelDark, 0.98);
  bg.fillRoundedRect(40, 130, GAME_WIDTH - 80, 990, 24);
  root.add(bg);

  // 목록/상세가 갈아 끼워지는 컨테이너
  let content = scene.add.container(0, 0);
  root.add(content);

  const resetContent = (): Phaser.GameObjects.Container => {
    content.destroy();
    content = scene.add.container(0, 0);
    root.add(content);
    return content;
  };

  const showList = (): void => {
    const c = resetContent();
    c.add(
      scene.add
        .text(GAME_WIDTH / 2, 190, '📖 게임 설명', {
          fontFamily: FONT,
          fontSize: '40px',
          color: COLORS.textCss,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
    );
    c.add(
      scene.add
        .text(GAME_WIDTH / 2, 240, '궁금한 항목을 골라보세요', {
          fontFamily: FONT,
          fontSize: '22px',
          color: COLORS.subCss,
        })
        .setOrigin(0.5)
    );

    let y = 300;
    for (const section of SECTIONS) {
      c.add(
        scene.add.text(80, y, section.label, {
          fontFamily: FONT,
          fontSize: '24px',
          color: COLORS.warnCss,
          fontStyle: 'bold',
        })
      );
      y += 48;
      // 두 칸 그리드
      section.topics.forEach((topic, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const btn = new Button(scene, GAME_WIDTH / 2 + (col === 0 ? -155 : 155), y + 40 + row * 96, {
          label: `${topic.icon} ${topic.title}`,
          width: 296,
          height: 84,
          fontSize: 26,
          onClick: () => showDetail(topic),
        });
        c.add(btn);
      });
      y += Math.ceil(section.topics.length / 2) * 96 + 18;
    }

    const closeBtn = new Button(scene, GAME_WIDTH / 2, 1050, {
      label: '닫기',
      width: 280,
      height: 86,
      onClick: () => {
        root.destroy();
        onClose();
      },
    });
    c.add(closeBtn);
  };

  const showDetail = (topic: HelpTopic): void => {
    const c = resetContent();
    c.add(
      scene.add
        .text(GAME_WIDTH / 2, 200, `${topic.icon} ${topic.title}`, {
          fontFamily: FONT,
          fontSize: '40px',
          color: COLORS.warnCss,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
    );
    c.add(
      scene.add.text(84, 270, topic.body, {
        fontFamily: FONT,
        fontSize: '26px',
        color: COLORS.textCss,
        lineSpacing: 12,
        wordWrap: { width: GAME_WIDTH - 180 },
      })
    );

    // 연습 가능한 퀘스트 — 목숨/기록에 영향 없이 바로 체험
    const practice = topic.practice;
    if (practice) {
      const practiceBtn = new Button(scene, GAME_WIDTH / 2, 928, {
        label: '🎓 연습해보기 (목숨·기록 무관)',
        width: 480,
        height: 96,
        color: COLORS.safe,
        fontSize: 30,
        onClick: () => {
          root.destroy();
          onClose();
          gameState.startPractice();
          if (practice.kind === 'main') {
            scene.scene.start(practice.key);
          } else {
            // 미니 퀘스트는 오버레이 방식 — 타이틀을 pause하고 그 위에 띄운다
            scene.scene.launch(practice.key, { returnTo: scene.scene.key });
            scene.scene.pause();
          }
        },
      });
      c.add(practiceBtn);
    }

    const backBtn = new Button(scene, GAME_WIDTH / 2 - 130, 1050, {
      label: '← 목록',
      width: 240,
      height: 86,
      onClick: () => showList(),
    });
    c.add(backBtn);
    const closeBtn = new Button(scene, GAME_WIDTH / 2 + 130, 1050, {
      label: '닫기',
      width: 240,
      height: 86,
      onClick: () => {
        root.destroy();
        onClose();
      },
    });
    c.add(closeBtn);
  };

  showList();
  return root;
}

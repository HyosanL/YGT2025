import { GAME_HEIGHT, GAME_WIDTH } from '../config';

/**
 * 게임 캔버스 위에 겹쳐 놓는 실제 <input> — 모바일 가상 키보드용 (타자 미니게임).
 * 투명한 숨김 input은 iOS/안드로이드에서 키보드가 안 뜨는 경우가 잦아,
 * 눈에 보이는 진짜 입력창을 게임 좌표에 맞춰 배치한다.
 * 사용자가 입력창을 '직접 탭'하는 것이 가장 확실한 키보드 소환 경로다.
 */
export interface HiddenInput {
  el: HTMLInputElement;
  focus(): void;
  clear(): void;
  readonly value: string;
  /** 진행 피드백용 글자색 변경 (오타 = 빨강) */
  setColor(color: string): void;
  destroy(): void;
}

export interface HiddenInputOptions {
  onInput: (value: string) => void;
  onEnter?: () => void;
  onFocus?: () => void;
  /** 게임 좌표(720×1280 기준) 배치 영역 — 캔버스 스케일에 맞춰 CSS로 환산.
   *  생략하면 화면 하단의 반투명 스트립으로 배치한다. */
  rect?: { x: number; y: number; w: number; h: number };
  /** 빈 입력창에 흐리게 뜨는 안내 문구 (예: 카톡 '메시지 입력') */
  placeholder?: string;
  /** 테마별 외형 오버라이드 (기본: 어두운 게임 테마) */
  style?: Partial<{
    background: string;
    border: string;
    color: string;
    caretColor: string;
    textAlign: string;
  }>;
  /**
   * 입력창 바로 위에 붙는 안내 라벨 (예: 따라 쳐야 할 문장).
   * DOM이라 가상 키보드가 올라와도 입력창과 함께 화면에 남는다 —
   * 캔버스에 그린 텍스트는 키보드에 가려질 수 있는 문제의 해결책.
   */
  label?: { text: string; background: string; color: string };
}

export function createHiddenInput(opts: HiddenInputOptions): HiddenInput {
  const el = document.createElement('input');
  el.type = 'text';
  el.autocomplete = 'off';
  el.autocapitalize = 'off';
  el.spellcheck = false;
  el.setAttribute('autocorrect', 'off');
  el.setAttribute('enterkeyhint', 'send');
  if (opts.placeholder) el.placeholder = opts.placeholder;

  Object.assign(el.style, {
    position: 'fixed',
    boxSizing: 'border-box',
    background: opts.style?.background ?? 'rgba(13, 20, 36, 0.96)',
    border: opts.style?.border ?? '2px solid rgba(255, 180, 0, 0.75)',
    borderRadius: '12px',
    color: opts.style?.color ?? '#f5f5f5',
    caretColor: opts.style?.caretColor ?? '#ffb400',
    textAlign: opts.style?.textAlign ?? 'center',
    outline: 'none',
    padding: '0 10px',
    // iOS가 포커스 시 자동 줌하지 않도록 16px 이상 유지
    fontSize: '16px',
    zIndex: '30',
  } satisfies Partial<CSSStyleDeclaration>);

  // 입력창 위에 붙는 안내 라벨 (선택)
  let labelEl: HTMLDivElement | null = null;
  if (opts.label) {
    labelEl = document.createElement('div');
    labelEl.textContent = opts.label.text;
    Object.assign(labelEl.style, {
      position: 'fixed',
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: opts.label.background,
      color: opts.label.color,
      fontWeight: 'bold',
      borderRadius: '12px',
      padding: '4px 10px',
      // 일차가 오르면 답장이 길어진다 — nowrap으로 두면 끝이 잘려 뭘 칠지 못 본다
      whiteSpace: 'normal',
      wordBreak: 'keep-all',
      lineHeight: '1.2',
      textAlign: 'center',
      zIndex: '30',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(labelEl);
  }

  /** 게임 좌표 → 실제 CSS 좌표 (캔버스 FIT 스케일/레터박스 반영) */
  const reposition = (): void => {
    const canvas = document.querySelector<HTMLCanvasElement>('#app canvas');
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const sx = r.width / GAME_WIDTH;
    const sy = r.height / GAME_HEIGHT;
    const rect = opts.rect ?? { x: 60, y: GAME_HEIGHT - 150, w: GAME_WIDTH - 120, h: 90 };
    const h = rect.h * sy;
    const left = r.left + rect.x * sx;
    const width = rect.w * sx;

    // 따라 칠 문장은 **읽히는 게 최우선** — 라벨은 입력창 폭이 아니라 캔버스 전폭을
    // 쓰고, 폭에 맞춰 글꼴을 줄이되 그래도 작으면 두 줄로 눕힌다.
    const text = opts.label?.text ?? '';
    const CHAR_W = 0.56; // 한글 기준 글자 폭 ≈ 글꼴 크기의 절반 남짓
    const baseH = Math.max(34, h * 0.9);
    const labelLeft = r.left + 8;
    const labelW = Math.max(width, r.width - 16);
    let labelLines = 1;
    let labelFont = Math.min(baseH * 0.55, labelW / Math.max(1, text.length * CHAR_W));
    if (labelFont < 18 && text.length > 0) {
      labelLines = 2;
      labelFont = Math.min(baseH * 0.5, labelW / Math.max(1, (text.length / 2) * CHAR_W));
    }
    labelFont = Math.max(16, labelFont);
    const labelH = labelEl ? Math.max(baseH, labelFont * 1.35 * labelLines + 10) : 0;
    const labelGap = labelEl ? 6 : 0;

    let top = r.top + rect.y * sy;
    // 실제 카톡처럼 입력창을 **키보드 바로 위**에 붙인다 (따라 칠 라벨은 그 위).
    // 키보드가 올라오면 visualViewport 높이가 줄어드니 그 하단(=가시영역 바닥)이 곧
    // 키보드 상단이다. 자연 위치(rect.y)보다 위로 솟지 않게, 라벨이 화면 밖으로
    // 넘치지 않게만 클램프한다.
    const vv = window.visualViewport;
    if (vv) {
      const keyboardTop = vv.offsetTop + vv.height; // 가시영역 하단 = 키보드 상단
      const dockedTop = keyboardTop - h - 14;
      const labelCeil = vv.offsetTop + labelH + labelGap + 8; // 라벨이 안 잘리는 최상단
      if (document.activeElement === el) {
        // 포커스 중(키보드 올라옴): 키보드 바로 위에 도킹
        top = Math.max(labelCeil, dockedTop);
      } else {
        // 비포커스: 자연 위치를 쓰되 가시영역 밖이면 끌어올린다
        top = Math.min(top, dockedTop);
      }
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${width}px`;
    el.style.height = `${h}px`;
    el.style.fontSize = `${Math.max(16, Math.round(h * 0.42))}px`;
    if (labelEl) {
      labelEl.style.left = `${labelLeft}px`;
      labelEl.style.width = `${labelW}px`;
      labelEl.style.height = `${labelH}px`;
      labelEl.style.top = `${top - labelH - labelGap}px`;
      labelEl.style.fontSize = `${Math.round(labelFont)}px`;
      labelEl.style.boxShadow = '0 3px 0 rgba(0,0,0,0.55)';
    }
  };

  const handleInput = (): void => opts.onInput(el.value);
  const handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      opts.onEnter?.();
    }
  };
  const handleFocus = (): void => {
    opts.onFocus?.();
    // 포커스 즉시 상단 도킹 + 키보드 애니메이션 후 재계산
    reposition();
    window.setTimeout(reposition, 250);
    window.setTimeout(reposition, 600);
  };
  const handleBlur = (): void => {
    window.setTimeout(reposition, 100);
  };
  const handleViewportChange = (): void => reposition();

  el.addEventListener('input', handleInput);
  el.addEventListener('keydown', handleKeydown);
  el.addEventListener('focus', handleFocus);
  el.addEventListener('blur', handleBlur);
  window.addEventListener('resize', handleViewportChange);
  window.visualViewport?.addEventListener('resize', handleViewportChange);
  window.visualViewport?.addEventListener('scroll', handleViewportChange);
  document.body.appendChild(el);
  reposition();

  return {
    el,
    focus: () => {
      // 키보드가 내려갔는데 포커스만 남아 있으면 재포커스가 무시된다 — 확실히 리셋
      if (document.activeElement === el) el.blur();
      el.focus({ preventScroll: true });
    },
    clear: () => {
      el.value = '';
    },
    get value() {
      return el.value;
    },
    setColor: (color: string) => {
      el.style.color = color;
    },
    destroy: () => {
      el.removeEventListener('input', handleInput);
      el.removeEventListener('keydown', handleKeydown);
      el.removeEventListener('focus', handleFocus);
      el.removeEventListener('blur', handleBlur);
      window.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
      labelEl?.remove();
      el.remove();
    },
  };
}

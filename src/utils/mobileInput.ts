import { GAME_HEIGHT, GAME_WIDTH } from '../config';

/**
 * 게임 캔버스 위에 겹쳐 놓는 실제 <input> — 모바일 가상 키보드용 (타자 미니게임).
 * 카톡 답장은 이 입력창을 **실제 카톡 입력바 모양(흰 알약 + ＋ + 전송 ➤)** 으로 감싸,
 * 평소엔 카톡 화면 하단 입력바 자리에 얹혀 있다가 키보드가 뜨면 그 위로 도킹한다.
 * (따로 뜨는 팝업 입력창을 없애고, 카톡 화면의 입력바를 그대로 누르는 느낌)
 */
export interface HiddenInput {
  el: HTMLInputElement;
  focus(): void;
  clear(): void;
  readonly value: string;
  setColor(color: string): void;
  destroy(): void;
}

export interface HiddenInputOptions {
  onInput: (value: string) => void;
  onEnter?: () => void;
  onFocus?: () => void;
  /** 게임 좌표(720×GAME_HEIGHT 기준) 배치 영역 — 카톡 입력바 전체 사각형. */
  rect?: { x: number; y: number; w: number; h: number };
  /** 빈 입력창 안내 문구 (카톡 '메시지 입력') */
  placeholder?: string;
  /** 카톡 입력바 스타일로 감쌀지 (＋ 아이콘 + 흰 알약 + 노란 전송 ➤ 버튼) */
  kakaoBar?: boolean;
  /** 전송 버튼(➤)을 누르면 호출 */
  onSend?: () => void;
  style?: Partial<{ background: string; border: string; color: string; caretColor: string; textAlign: string }>;
  /** 입력바 바로 위에 붙는 안내 라벨 (따라 쳐야 할 문장) */
  label?: { text: string; background: string; color: string };
}

export function createHiddenInput(opts: HiddenInputOptions): HiddenInput {
  const kakao = opts.kakaoBar === true;

  // 실제 입력 <input>
  const el = document.createElement('input');
  el.type = 'text';
  el.autocomplete = 'off';
  el.autocapitalize = 'off';
  el.spellcheck = false;
  el.setAttribute('autocorrect', 'off');
  el.setAttribute('enterkeyhint', 'send');
  if (opts.placeholder) el.placeholder = opts.placeholder;

  // 카톡 바 = 흰 알약 컨테이너 안에 [＋] [input] [➤]. 아니면 그냥 <input> 하나.
  const bar = document.createElement('div');
  Object.assign(bar.style, {
    position: 'fixed',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    background: opts.style?.background ?? (kakao ? '#ffffff' : 'rgba(13,20,36,0.96)'),
    border: opts.style?.border ?? (kakao ? '1.5px solid #e4e7eb' : '2px solid rgba(255,180,0,0.75)'),
    borderRadius: kakao ? '26px' : '12px',
    padding: kakao ? '0 6px 0 14px' : '0 10px',
    boxShadow: kakao ? '0 4px 14px rgba(0,0,0,0.28)' : 'none',
    zIndex: '30',
  } satisfies Partial<CSSStyleDeclaration>);

  if (kakao) {
    const plus = document.createElement('div');
    plus.textContent = '＋';
    Object.assign(plus.style, {
      color: '#8b95a1', fontSize: '26px', lineHeight: '1', flex: '0 0 auto',
      paddingRight: '8px', pointerEvents: 'none', userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    bar.appendChild(plus);
  }

  Object.assign(el.style, {
    flex: '1 1 auto',
    minWidth: '0',
    boxSizing: 'border-box',
    background: 'transparent',
    border: 'none',
    color: opts.style?.color ?? (kakao ? '#1a1a1a' : '#f5f5f5'),
    caretColor: opts.style?.caretColor ?? (kakao ? '#d4a017' : '#ffb400'),
    textAlign: opts.style?.textAlign ?? (kakao ? 'left' : 'center'),
    outline: 'none',
    padding: '0',
    // iOS가 포커스 시 자동 줌하지 않도록 16px 이상 유지
    fontSize: '17px',
  } satisfies Partial<CSSStyleDeclaration>);
  bar.appendChild(el);

  // 노란 전송 ➤ 버튼
  let sendBtn: HTMLButtonElement | null = null;
  if (kakao && opts.onSend) {
    sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.textContent = '➤';
    Object.assign(sendBtn.style, {
      flex: '0 0 auto', border: 'none', cursor: 'pointer',
      background: '#fee500', color: '#3c1e1e',
      borderRadius: '50%', fontSize: '18px', lineHeight: '1',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    // 탭이 캔버스로 새지 않게, 포커스가 풀려 키보드가 내려가지 않게
    sendBtn.addEventListener('pointerdown', (e) => e.preventDefault());
    sendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      opts.onSend?.();
    });
    bar.appendChild(sendBtn);
  }

  // 따라 칠 문장 라벨 (입력바 바로 위)
  let labelEl: HTMLDivElement | null = null;
  if (opts.label) {
    labelEl = document.createElement('div');
    labelEl.textContent = opts.label.text;
    Object.assign(labelEl.style, {
      position: 'fixed', boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: opts.label.background, color: opts.label.color,
      fontWeight: 'bold', borderRadius: '14px', padding: '4px 12px',
      whiteSpace: 'normal', wordBreak: 'keep-all', lineHeight: '1.2',
      textAlign: 'center', zIndex: '30', pointerEvents: 'none',
      boxShadow: '0 3px 10px rgba(0,0,0,0.35)',
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

    // 라벨 폭·글꼴 (전폭 사용, 넘치면 두 줄)
    const text = opts.label?.text ?? '';
    const CHAR_W = 0.56;
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
    const labelGap = labelEl ? 8 : 0;

    // 평소엔 카톡 입력바 자리(rect.y). 키보드가 뜨면 그 바로 위로 도킹(카톡처럼 올라옴).
    let top = r.top + rect.y * sy;
    const vv = window.visualViewport;
    if (vv) {
      const keyboardTop = vv.offsetTop + vv.height; // 가시영역 하단 = 키보드 상단
      const dockedTop = keyboardTop - h - 12;
      const labelCeil = vv.offsetTop + labelH + labelGap + 8;
      if (document.activeElement === el) {
        top = Math.max(labelCeil, dockedTop);
      } else {
        top = Math.min(top, dockedTop);
      }
    }
    bar.style.left = `${left}px`;
    bar.style.top = `${top}px`;
    bar.style.width = `${width}px`;
    bar.style.height = `${h}px`;
    el.style.fontSize = `${Math.max(16, Math.round(h * 0.4))}px`;
    if (sendBtn) {
      const d = Math.round(h * 0.8);
      sendBtn.style.width = `${d}px`;
      sendBtn.style.height = `${d}px`;
      sendBtn.style.fontSize = `${Math.round(d * 0.42)}px`;
    }
    if (labelEl) {
      labelEl.style.left = `${labelLeft}px`;
      labelEl.style.width = `${labelW}px`;
      labelEl.style.height = `${labelH}px`;
      labelEl.style.top = `${top - labelH - labelGap}px`;
      labelEl.style.fontSize = `${Math.round(labelFont)}px`;
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
  document.body.appendChild(bar);
  reposition();

  return {
    el,
    focus: () => {
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
      bar.remove();
    },
  };
}

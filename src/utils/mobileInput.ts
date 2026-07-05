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
}

export function createHiddenInput(opts: HiddenInputOptions): HiddenInput {
  const el = document.createElement('input');
  el.type = 'text';
  el.autocomplete = 'off';
  el.autocapitalize = 'off';
  el.spellcheck = false;
  el.setAttribute('autocorrect', 'off');
  el.setAttribute('enterkeyhint', 'send');

  Object.assign(el.style, {
    position: 'fixed',
    boxSizing: 'border-box',
    background: 'rgba(13, 20, 36, 0.96)',
    border: '2px solid rgba(255, 180, 0, 0.75)',
    borderRadius: '12px',
    color: '#f5f5f5',
    caretColor: '#ffb400',
    textAlign: 'center',
    outline: 'none',
    padding: '0 10px',
    // iOS가 포커스 시 자동 줌하지 않도록 16px 이상 유지
    fontSize: '16px',
    zIndex: '30',
  } satisfies Partial<CSSStyleDeclaration>);

  /** 게임 좌표 → 실제 CSS 좌표 (캔버스 FIT 스케일/레터박스 반영) */
  const reposition = (): void => {
    const canvas = document.querySelector<HTMLCanvasElement>('#app canvas');
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const sx = r.width / GAME_WIDTH;
    const sy = r.height / GAME_HEIGHT;
    const rect = opts.rect ?? { x: 60, y: GAME_HEIGHT - 150, w: GAME_WIDTH - 120, h: 90 };
    const h = rect.h * sy;
    let top = r.top + rect.y * sy;
    // iOS는 키보드가 떠도 레이아웃 뷰포트가 안 줄어든다 — 키보드에 가려질 위치면
    // 보이는 영역(visualViewport) 하단 바로 위로 끌어올린다
    const vv = window.visualViewport;
    if (vv) {
      const maxTop = vv.offsetTop + vv.height - h - 12;
      if (top > maxTop) top = Math.max(12, maxTop);
    }
    el.style.left = `${r.left + rect.x * sx}px`;
    el.style.top = `${top}px`;
    el.style.width = `${rect.w * sx}px`;
    el.style.height = `${h}px`;
    el.style.fontSize = `${Math.max(16, Math.round(h * 0.42))}px`;
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
    // 키보드가 올라와 뷰포트가 줄어든 뒤 캔버스가 재배치되므로 한 박자 뒤 재계산
    window.setTimeout(reposition, 250);
    window.setTimeout(reposition, 600);
  };
  const handleViewportChange = (): void => reposition();

  el.addEventListener('input', handleInput);
  el.addEventListener('keydown', handleKeydown);
  el.addEventListener('focus', handleFocus);
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
      window.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
      el.remove();
    },
  };
}

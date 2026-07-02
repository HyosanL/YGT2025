/**
 * 숨겨진 <input> DOM 요소로 모바일 가상 키보드를 띄운다 (타자 미니게임용).
 * 화면에는 보이지 않지만 포커스는 받을 수 있도록 opacity만 낮춰서 유지.
 */
export interface HiddenInput {
  el: HTMLInputElement;
  focus(): void;
  clear(): void;
  readonly value: string;
  destroy(): void;
}

export interface HiddenInputOptions {
  onInput: (value: string) => void;
  onEnter?: () => void;
  onFocus?: () => void;
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
    bottom: '0',
    left: '0',
    width: '100%',
    height: '36px',
    opacity: '0.01',
    // iOS가 포커스 시 자동 줌하지 않도록 16px 이상 유지
    fontSize: '16px',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'transparent',
    caretColor: 'transparent',
    zIndex: '10',
  } satisfies Partial<CSSStyleDeclaration>);

  const handleInput = (): void => opts.onInput(el.value);
  const handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      opts.onEnter?.();
    }
  };
  const handleFocus = (): void => opts.onFocus?.();

  el.addEventListener('input', handleInput);
  el.addEventListener('keydown', handleKeydown);
  el.addEventListener('focus', handleFocus);
  document.body.appendChild(el);

  return {
    el,
    focus: () => el.focus({ preventScroll: true }),
    clear: () => {
      el.value = '';
    },
    get value() {
      return el.value;
    },
    destroy: () => {
      el.removeEventListener('input', handleInput);
      el.removeEventListener('keydown', handleKeydown);
      el.removeEventListener('focus', handleFocus);
      el.remove();
    },
  };
}

/**
 * 일차(숫자) 선택용 DOM 오버레이 다이얼로그 (Promise 기반).
 * 숫자 입력 + −/＋ 스테퍼로 원하는 일차를 고른다.
 * 확인 → 정수(클램프), 취소 → null.
 */
const DAY_MIN = 1;
const DAY_MAX = 99;

export function askDay(
  defaultDay = 1,
  titleText = '몇 일차로 해볼까? (1~99)'
): Promise<number | null> {
  const clamp = (n: number): number =>
    Math.max(DAY_MIN, Math.min(DAY_MAX, Math.floor(Number.isFinite(n) ? n : DAY_MIN)));

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0,0,0,0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '100',
    } satisfies Partial<CSSStyleDeclaration>);

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      background: '#16213e',
      borderRadius: '16px',
      padding: '24px',
      width: 'min(82vw, 340px)',
      textAlign: 'center',
      fontFamily: "'Malgun Gothic', sans-serif",
      color: '#f5f5f5',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    } satisfies Partial<CSSStyleDeclaration>);

    const title = document.createElement('div');
    title.textContent = titleText;
    Object.assign(title.style, { fontSize: '18px', marginBottom: '16px', fontWeight: 'bold' });

    // −  [입력]  ＋  한 줄
    const stepperRow = document.createElement('div');
    Object.assign(stepperRow.style, {
      display: 'flex',
      gap: '10px',
      alignItems: 'stretch',
      justifyContent: 'center',
    } satisfies Partial<CSSStyleDeclaration>);

    const makeStep = (label: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.textContent = label;
      Object.assign(b.style, {
        width: '58px',
        fontSize: '28px',
        borderRadius: '10px',
        border: 'none',
        background: '#0f3460',
        color: '#f5f5f5',
        cursor: 'pointer',
      } satisfies Partial<CSSStyleDeclaration>);
      return b;
    };

    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.min = String(DAY_MIN);
    input.max = String(DAY_MAX);
    input.value = String(clamp(defaultDay));
    Object.assign(input.style, {
      flex: '1',
      minWidth: '0',
      boxSizing: 'border-box',
      fontSize: '30px',
      fontWeight: 'bold',
      padding: '10px 8px',
      borderRadius: '10px',
      border: '2px solid #0f3460',
      background: '#1a1a2e',
      color: '#f5f5f5',
      outline: 'none',
      textAlign: 'center',
    } satisfies Partial<CSSStyleDeclaration>);

    const minusBtn = makeStep('−');
    const plusBtn = makeStep('＋');
    const nudge = (delta: number): void => {
      input.value = String(clamp((parseInt(input.value, 10) || DAY_MIN) + delta));
    };
    minusBtn.addEventListener('click', () => nudge(-1));
    plusBtn.addEventListener('click', () => nudge(1));
    stepperRow.append(minusBtn, input, plusBtn);

    const buttonRow = document.createElement('div');
    Object.assign(buttonRow.style, { display: 'flex', gap: '10px', marginTop: '18px' });

    const makeButton = (label: string, bg: string): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.textContent = label;
      Object.assign(btn.style, {
        flex: '1',
        fontSize: '17px',
        padding: '12px 0',
        borderRadius: '10px',
        border: 'none',
        background: bg,
        color: '#f5f5f5',
        cursor: 'pointer',
      } satisfies Partial<CSSStyleDeclaration>);
      return btn;
    };

    const cancelBtn = makeButton('취소', '#0f3460');
    const okBtn = makeButton('확인', '#e94560');

    const close = (value: number | null): void => {
      overlay.remove();
      resolve(value);
    };

    cancelBtn.addEventListener('click', () => close(null));
    okBtn.addEventListener('click', () => close(clamp(parseInt(input.value, 10))));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') okBtn.click();
    });

    buttonRow.append(cancelBtn, okBtn);
    panel.append(title, stepperRow, buttonRow);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    input.focus();
    input.select();
  });
}

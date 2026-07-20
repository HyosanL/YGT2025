/**
 * 닉네임 입력용 DOM 오버레이 다이얼로그 (Promise 기반).
 * 확인 → 입력값(트림), 취소 → null.
 */
export function askNickname(defaultValue: string, titleText = '닉네임 (1~12자)'): Promise<string | null> {
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
      width: 'min(80vw, 320px)',
      textAlign: 'center',
      fontFamily: "'Malgun Gothic', sans-serif",
      color: '#f5f5f5',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    } satisfies Partial<CSSStyleDeclaration>);

    const title = document.createElement('div');
    title.textContent = titleText;
    Object.assign(title.style, { fontSize: '18px', marginBottom: '14px', fontWeight: 'bold' });

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 12;
    input.value = defaultValue;
    input.placeholder = '김공군';
    Object.assign(input.style, {
      width: '100%',
      boxSizing: 'border-box',
      fontSize: '18px',
      padding: '10px 12px',
      borderRadius: '10px',
      border: '2px solid #0f3460',
      background: '#1a1a2e',
      color: '#f5f5f5',
      outline: 'none',
      textAlign: 'center',
    } satisfies Partial<CSSStyleDeclaration>);

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

    const close = (value: string | null): void => {
      overlay.remove();
      resolve(value);
    };

    cancelBtn.addEventListener('click', () => close(null));
    okBtn.addEventListener('click', () => {
      const v = input.value.trim();
      if (v.length >= 1) close(v);
      else input.focus();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') okBtn.click();
    });

    buttonRow.append(cancelBtn, okBtn);
    panel.append(title, input, buttonRow);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    input.focus();
    input.select();
  });
}

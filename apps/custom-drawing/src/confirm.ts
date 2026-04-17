// tiny promise-based confirmation dialog reusing the existing modal styles.
// not worth roping in a full AYS web component when this is ~30 lines
// ********************************************************************************
interface ConfirmOptions {
  readonly title?: string;
  readonly message: string;
  readonly okLabel?: string;
}

// == API =========================================================================
/** show a confirm dialog; resolves true if OK, false if Cancel / backdrop / Esc */
export const confirm = ({ title = 'Are you sure?', message, okLabel = 'OK' }: ConfirmOptions): Promise<boolean> => {
  const modal   = document.getElementById('confirmModal')!;
  const titleEl = document.getElementById('confirmTitle')!;
  const msgEl   = document.getElementById('confirmMessage')!;
  const okBtn   = document.getElementById('confirmOk')! as HTMLButtonElement;
  const cancel  = document.getElementById('confirmCancel')! as HTMLButtonElement;

  titleEl.textContent = title;
  msgEl.textContent   = message;
  okBtn.textContent   = okLabel;

  return new Promise<boolean>((resolve) => {
    const done = (v: boolean) => {
      modal.classList.remove('visible');
      okBtn.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onOk       = () => done(true);
    const onCancel   = () => done(false);
    const onBackdrop = (e: MouseEvent) => { if(e.target === modal) done(false); };
    const onKey      = (e: KeyboardEvent) => {
      if(e.key === 'Escape') done(false);
      else if(e.key === 'Enter') done(true);
      /* else -- not a binding of interest */
    };

    okBtn.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);

    modal.classList.add('visible');
    // focus cancel by default for safety on destructive prompts
    cancel.focus();
  });
};

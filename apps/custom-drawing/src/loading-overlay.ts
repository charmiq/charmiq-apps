// modal busy-indicator shown while long-running commands are in flight
// (image generation / upload / file save). A single style tag is injected on
// first use; each overlay gets its own DOM node so concurrent calls are safe
// ********************************************************************************
// == Types =======================================================================
export interface LoadingOverlay {
  setMessage(message: string): void;
  dismiss(): void;
}

// == Public API ==================================================================
export const showLoadingOverlay = (initialMessage = 'Loading...'): LoadingOverlay => {
  ensureStyles();

  const overlay = document.createElement('div');
  overlay.className = 'charmiq-loading-overlay';

  const content = document.createElement('div');
  content.className = 'charmiq-loading-content';

  const spinner = document.createElement('div');
  spinner.className = 'charmiq-loading-spinner';

  const message = document.createElement('div');
  message.className = 'charmiq-loading-message';
  message.textContent = initialMessage;

  content.append(spinner, message);
  overlay.appendChild(content);
  document.body.appendChild(overlay);

  return {
    setMessage: (m) => { message.textContent = m; },
    dismiss: () => { overlay.remove(); },
  };
};

// == Styles (injected once) ======================================================
const ensureStyles = (): void => {
  if(document.getElementById('charmiq-loading-overlay-style')) return/*nothing to do*/;
  const style = document.createElement('style');
  style.id = 'charmiq-loading-overlay-style';
  style.textContent = `
    .charmiq-loading-overlay {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex; align-items: center; justify-content: center;
      z-index: 3000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .charmiq-loading-content {
      background: #fff; border-radius: 8px; padding: 24px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
      text-align: center; min-width: 300px;
    }
    .charmiq-loading-spinner {
      width: 40px; height: 40px;
      border: 4px solid #f3f3f3; border-top: 4px solid #4285f4;
      border-radius: 50%;
      margin: 0 auto 16px;
      animation: charmiq-loading-spin 1s linear infinite;
    }
    .charmiq-loading-message { font-size: 16px; color: #333; font-weight: 500; }
    @keyframes charmiq-loading-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
};

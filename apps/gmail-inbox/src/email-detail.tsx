/** @jsx h */
import { h } from './h';

import { Avatar } from './avatar';
import { formatFullDate } from './format';
import type { InboxModel } from './inbox-model';
import type { InboxEmail } from './types';

// the detail panel. A plain-text body renders as text; an HTML body renders in a
// sandboxed (`allow-scripts`, no same-origin) iframe so nothing in the email can
// reach the app — an injected reporter posts the content height back so the frame
// grows to fit. The header sits ABOVE the scroll area, so collapsing it on scroll
// never reflows (or jumps) the scrolled content
// ********************************************************************************
// == Constants ===================================================================
const HEIGHT_MESSAGE = 'gmail-inbox:body-height';

/** measures its own document and reports the height to the parent. Runs inside the
 *  sandbox, which is why the height has to travel back by postMessage */
const HEIGHT_REPORTER = '<scr' + 'ipt>' + `
  (function() {
    function report() {
      var height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      parent.postMessage({ type: '${HEIGHT_MESSAGE}', height: height }, '*');
    }
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', report);
    else report();
    setTimeout(report, 100);
    setTimeout(report, 500);
    window.addEventListener('load', report);
  })();
` + '</scr' + 'ipt>';

// == Body Mounting ===============================================================
/** mount an HTML email body as a sandboxed, self-sizing iframe. Returns a cleanup
 *  that drops the height listener */
const mountHtmlBody = (container: HTMLElement, html: string): (() => void) => {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts')/*scripts run, but with a null origin — no reach into the app*/;
  iframe.setAttribute('scrolling', 'no');
  container.appendChild(iframe);

  const onMessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; height?: number; };
    if((event.source === iframe.contentWindow) && (data?.type === HEIGHT_MESSAGE) && (typeof data.height === 'number')) {
      iframe.style.height = `${data.height}px`;
    }
  };
  window.addEventListener('message', onMessage);

  const bodyClose = html.toLowerCase().lastIndexOf('</body>');
  iframe.srcdoc = (bodyClose > 0)
    ? html.slice(0, bodyClose) + HEIGHT_REPORTER + html.slice(bodyClose)
    : html + HEIGHT_REPORTER;

  return () => window.removeEventListener('message', onMessage);
};

// == Detail ======================================================================
/** build one email's detail. Returns the element plus a cleanup for its body listener */
const buildDetail = (email: InboxEmail): { element: HTMLElement; cleanup: (() => void) | null; } => {
  const body = (<div class="detail-body" />) as HTMLElement;
  let cleanup: (() => void) | null = null;
  if(email.bodyHtml === null) body.textContent = email.bodyText || email.snippet;
  else cleanup = mountHtmlBody(body, email.bodyHtml);

  const head = (
    <div class="detail-head">
      <div class="detail-subject">
        {Avatar({ account: email.account, size: 24 })}
        <span>{email.subject}</span>
      </div>
      <div class="detail-meta">
        <div class="detail-meta-row"><span class="detail-label">From</span><span>{email.from}</span></div>
        <div class="detail-meta-row"><span class="detail-label">To</span><span>{email.to}</span></div>
        <div class="detail-meta-row"><span class="detail-label">Date</span><span>{formatFullDate(email.dateHeader)}</span></div>
      </div>
    </div>
  ) as HTMLElement;

  const scroll = (<div class="detail-scroll">{body}</div>) as HTMLElement;

  // collapse the header once the body is scrolled down; expand at the top. Hysteresis
  // (56 / 24) against a boundary flicker; the header is outside the scroll area, so
  // resizing it never moves the scroll position
  let frame = 0;
  const check = (): void => {
    if(scroll.scrollTop > 56) head.classList.add('compact');
    else if(scroll.scrollTop < 24) head.classList.remove('compact');
  };
  scroll.addEventListener('scroll', () => {
    if(frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(check);
  }, { passive: true });

  return { element: (<div class="detail">{head}{scroll}</div>) as HTMLElement, cleanup };
};

// == Panel =======================================================================
export const EmailDetail = (model: InboxModel): Node => {
  const panel = (<div class="detail-panel" />) as HTMLElement;

  let lastKey: string | undefined;
  let cleanup: (() => void) | null = null;

  const render = (): void => {
    const state = model.getState();
    const noAccounts = (state.status === 'ready') && (state.accounts.length < 1);
    // rebuild only when the shown email (or the no-account state) changes, so an
    // unrelated emit never re-mounts the body iframe
    const key = noAccounts ? 'no-accounts' : (state.selectedEmail?.id ?? 'none');
    if(key === lastKey) return;
    lastKey = key;

    if(cleanup) { cleanup(); cleanup = null; }

    if(noAccounts) {
      panel.replaceChildren(<div class="placeholder">Connect a Gmail account to get started — use the add-account button above.</div>);
      return;
    } /* else -- an account is present */
    if(!state.selectedEmail) {
      panel.replaceChildren(<div class="placeholder">Select an email to read it.</div>);
      return;
    } /* else -- render the selected email */

    const detail = buildDetail(state.selectedEmail);
    cleanup = detail.cleanup;
    panel.replaceChildren(detail.element);
  };

  model.subscribe(render);
  render();
  return panel;
};

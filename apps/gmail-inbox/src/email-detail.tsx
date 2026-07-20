/** @jsx h */
import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import { Avatar } from './avatar';
import { formatFullDate } from './format';
import type { InboxEmail } from './types';

// the detail panel. A plain-text body renders as text; an HTML body renders in a
// sandboxed (`allow-scripts`, no same-origin) iframe so nothing in the email can
// reach the app — an injected reporter posts the content height back so the frame
// grows to fit instead of nesting a scrollbar
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
    } /* else -- not the height message from this iframe, ignore */
  };
  window.addEventListener('message', onMessage);

  const bodyClose = html.toLowerCase().lastIndexOf('</body>');
  iframe.srcdoc = (bodyClose > 0)
    ? html.slice(0, bodyClose) + HEIGHT_REPORTER + html.slice(bodyClose)
    : html + HEIGHT_REPORTER;

  return () => window.removeEventListener('message', onMessage);
};

// == Component ===================================================================
export const EmailDetail = ({ email }: { email: InboxEmail | null; }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = bodyRef.current;
    if(!container || !email) return;

    container.innerHTML = '';
    if(email.bodyHtml === null) {
      container.textContent = email.bodyText || email.snippet;
      return;
    } /* else -- HTML body: mount the sandboxed frame */
    return mountHtmlBody(container, email.bodyHtml);
  }, [email?.id]);

  // collapse the header once the body is scrolled down; expand it at the top. The
  // header sits ABOVE the scroll area (a flex sibling), not inside it — so resizing
  // it on collapse never moves the scroll position, which is what removes the
  // reflow feedback (collapse → jump-to-top) a sticky in-scroll header suffers.
  // The class is toggled on the DOM directly (not render state) so scrolling never
  // re-mounts the body iframe; the 56/24 gap is hysteresis against a boundary flicker
  useEffect(() => {
    const scroller = scrollRef.current;
    const head = headRef.current;
    if(!scroller || !head || !email) return;

    scroller.scrollTop = 0;
    head.classList.remove('compact')/*a freshly selected email starts expanded at the top*/;

    let frame = 0;
    const check = () => {
      if(scroller.scrollTop > 56) head.classList.add('compact');
      else if(scroller.scrollTop < 24) head.classList.remove('compact');
    };
    const onScroll = () => {
      if(frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => { scroller.removeEventListener('scroll', onScroll); if(frame) cancelAnimationFrame(frame); };
  }, [email?.id]);

  if(!email) return <div class="placeholder">Select an email to read it.</div>;

  return (
    <div class="detail">
      <div class="detail-head" ref={headRef}>
        <div class="detail-subject">
          <Avatar account={email.account} size={24} />
          <span>{email.subject}</span>
        </div>
        <div class="detail-meta">
          <div class="detail-meta-row"><span class="detail-label">From</span><span>{email.from}</span></div>
          <div class="detail-meta-row"><span class="detail-label">To</span><span>{email.to}</span></div>
          <div class="detail-meta-row"><span class="detail-label">Date</span><span>{formatFullDate(email.dateHeader)}</span></div>
        </div>
      </div>
      <div class="detail-scroll" ref={scrollRef}>
        <div class="detail-body" ref={bodyRef} />
      </div>
    </div>
  );
};

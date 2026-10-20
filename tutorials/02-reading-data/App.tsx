import React, { useEffect, useState } from 'react';

import type { AppContent } from '../../shared/charmiq'/*also activates the window.charmiq global augmentation*/;

// ********************************************************************************
export const App = () => {
  const [content, setContent] = useState<AppContent | null>();
  const [failure, setFailure] = useState<Error & { code?: string; }>();

  // == Initialization ============================================================
  // the Application's app-content, kept current: its text as it stands, or `null` when
  // the document holds none
  useEffect(() => {
    if(!window.charmiq.appContent.content$) return setFailure(Object.assign(new Error('a page opened before content$'), { code: 'unsupported' }));
    const sub = window.charmiq.appContent.content$().subscribe({ next: setContent, error: setFailure });
    return () => sub.unsubscribe()/*cleanup on unmount*/;
  }, []/*run once on mount*/);

  // == UI ========================================================================
  return (
    <div className="app">
      <h1>Reading Data</h1>
      {failure && <p className="content" role="alert">{(failure.code === 'unsupported') ? 'Reload this page to read the message.' : 'The message could not be read.'}</p>}
      {!failure && (content === null) && <p className="content">There is no message in the document.</p>}
      {!failure && content && <p className="content">{content.text || 'No content yet — edit the app-content in the document.'}</p>}
    </div>
  );
};

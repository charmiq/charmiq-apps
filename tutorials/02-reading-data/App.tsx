import React, { useEffect, useState } from 'react';

import type { AppContentBlock } from '../../shared/charmiq'/*also activates the window.charmiq global augmentation*/;

// ********************************************************************************
export const App = () => {
  const [block, setBlock] = useState<AppContentBlock | null>();
  const [failure, setFailure] = useState<Error & { code?: string; }>();

  // == Initialization ============================================================
  // the Application's block, kept current: its text as it stands, or `null` when
  // the document holds none
  useEffect(() => {
    if(!window.charmiq.appContent.block$) return setFailure(Object.assign(new Error('a page opened before blocks'), { code: 'unsupported' }));
    const sub = window.charmiq.appContent.block$().subscribe({ next: setBlock, error: setFailure });
    return () => sub.unsubscribe()/*cleanup on unmount*/;
  }, []/*run once on mount*/);

  // == UI ========================================================================
  return (
    <div className="app">
      <h1>Reading Data</h1>
      {failure && <p className="content" role="alert">{(failure.code === 'unsupported') ? 'Reload this page to read the message.' : (failure.code === 'functions/permission-denied') ? 'This Application isn\'t allowed to read the message.' : 'The message could not be read.'}</p>}
      {!failure && (block === null) && <p className="content">There is no message in the document.</p>}
      {!failure && block && <p className="content">{block.text || 'No content yet — edit the app-content in the document.'}</p>}
    </div>
  );
};

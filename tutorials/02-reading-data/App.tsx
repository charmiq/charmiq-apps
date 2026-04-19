import React, { useEffect, useState } from 'react';

import type {} from '../../shared/charmiq'/*activates the window.charmiq global augmentation*/;

// ********************************************************************************
export const App = () => {
  const [content, setContent] = useState(''/*default to empty*/);

  // == Initialization ============================================================
  // subscribe to document content; fires immediately with current value then on
  // every change (from any collaborator or Charm)
  useEffect(() => {
    const sub = window.charmiq.appContent.onChange$().subscribe(change => {
      if(!change.deleted) setContent(change.content);
    });
    return () => sub.unsubscribe()/*cleanup on unmount*/;
  }, []/*run once on mount*/);

  // == UI ========================================================================
  return (
    <div className="app">
      <h1>Reading Data</h1>
      <p className="content">{content || 'No content yet — edit the app-content in the document.'}</p>
    </div>
  );
};

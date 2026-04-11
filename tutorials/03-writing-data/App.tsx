import React, { useEffect, useRef, useState } from 'react';

// ********************************************************************************
export const App = () => {
  const updatingRef = useRef(false/*not updating to start*/);

  const [content, setContent] = useState(''/*default to empty string*/);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // == Initialization ============================================================
  // subscribe to incoming content changes; fires immediately with current value
  // then on every change (from any collaborator or Charm)
  useEffect(() => {
    const sub = window.charmiq.appContent.onChange$().subscribe(change => {
      if(updatingRef.current) return/*skip -- this is our own write echoing back*/;
      if(!change.deleted) setContent(change.content);
    });
    return () => sub.unsubscribe()/*cleanup on unmount*/;
  }, []/*run once on mount*/);

  // == Handlers ==================================================================
  // write the full content back to app-content
  const handleChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);

    updatingRef.current = true/*lock -- prevent onChange$ from re-rendering*/;
    await window.charmiq.appContent.set(newContent);
    updatingRef.current = false/*unlock -- allow remote changes through again*/;
  };

  // == UI ========================================================================
  return (
    <div className="app">
      <h1>Writing Data</h1>
      <textarea
        ref={textareaRef}
        className="editor"
        value={content}
        onChange={handleChange}
        placeholder="Type something — it writes to the document."
      />
    </div>
  );
};

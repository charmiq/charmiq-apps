import React, { useEffect, useRef, useState } from 'react';

// ********************************************************************************
export const App = () => {
  const [content, setContent] = useState(''/*default to empty string*/);
  const contentRef = useRef(content/*tracks the latest content for comparison*/);

  // == Initialization ============================================================
  // subscribe to incoming content changes; fires immediately with current value
  // then on every change (from any collaborator or Charm)
  useEffect(() => {
    const sub = window.charmiq.appContent.onChange$().subscribe(change => {
      if(change.deleted) return;

      // compare against what the component already has — if it matches, skip the
      // re-render. it doesn't matter whether this change came from the local user,
      // a collaborator, or a Charm — only whether the state already reflects it
      if(change.content === contentRef.current) return;

      contentRef.current = change.content;
      setContent(change.content);
    });
    return () => sub.unsubscribe()/*cleanup on unmount*/;
  }, []/*run once on mount*/);

  // == Handlers ==================================================================
  // write the full content back to app-content
  const handleChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    contentRef.current = newContent/*update ref so the subscription can compare*/;
    setContent(newContent);

    await window.charmiq.appContent.set(newContent);
  };

  // == UI ========================================================================
  return (
    <div className="app">
      <h1>Writing Data</h1>
      <textarea
        className="editor"
        value={content}
        onChange={handleChange}
        placeholder="Type something — it writes to the document."
      />
    </div>
  );
};

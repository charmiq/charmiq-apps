import React, { useEffect, useState } from 'react';

// ********************************************************************************
export const App = () => {
  const [content, setContent] = useState('');

  useEffect(() => {
    const sub = window.charmiq.appContent.onChange$().subscribe(change => {
      if(!change.deleted) setContent(change.content);
    });
    return () => sub.unsubscribe();
  }, []);

  return (
    <div className="app">
      <h1>Reading Data</h1>
      <p className="content">{content || 'No content yet — edit the app-content in the document.'}</p>
    </div>
  );
};

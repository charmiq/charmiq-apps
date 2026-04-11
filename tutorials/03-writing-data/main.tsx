import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

import './styles.scss';

// ********************************************************************************
// mount React into the #root div from index.html
const container = document.getElementById('root');
if(container) {
  const root = createRoot(container);
  root.render(<App />);
} else console.error('Root container not found. Ensure there is a div with id "root" in index.html');

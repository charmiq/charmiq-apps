/** @jsx h */
import { h, render } from 'preact';

import { App } from './app';

// entry point — mount the app into the shell in index.html. The CharmIQ bridge
// (window.charmiq) is injected before this runs, so no readiness check is needed
// ********************************************************************************
render(<App />, document.getElementById('app')!);

import { installLocalBridge } from './charmiq-local';

// the injection entry point: `build-app --harness` bundles this to an IIFE and
// inlines it ahead of the app, so `window.charmiq` exists before the app runs.
// installLocalBridge() is a no-op when a real bridge is already present
// ********************************************************************************
installLocalBridge();

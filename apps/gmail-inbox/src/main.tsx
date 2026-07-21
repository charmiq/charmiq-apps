import { App } from './app';
import { CommandSurface } from './command-surface';
import { InboxModel } from './inbox-model';

// entry point — build the model, mount the app, register the LLM command surface,
// and kick off the initial load. The CharmIQ bridge (window.charmiq) is injected
// before this runs, so no readiness check is needed
// ********************************************************************************
const model = new InboxModel();
document.getElementById('app')!.appendChild(App(model));

new CommandSurface(model).init();
void model.init();

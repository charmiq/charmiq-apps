/** @jsx h */
import { h } from './h';

import { AccountBar } from './account-bar';
import { EmailDetail } from './email-detail';
import type { InboxModel } from './inbox-model';
import { MasterList } from './master-list';
import { SearchBar } from './search-bar';

// the top-level layout: a master panel (header + search + list) beside the detail
// panel. Every piece subscribes to the model itself; this just wires the shell
// ********************************************************************************
export const App = (model: InboxModel): Node => (
  <div class="app">
    <div class="master-panel">
      {AccountBar(model)}
      {SearchBar(model)}
      {MasterList(model)}
    </div>
    {EmailDetail(model)}
  </div>
);

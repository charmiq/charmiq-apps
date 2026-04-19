# App Coordination

*Three apps, one document, zero shared code. Click a button in one — watch the others react.*

## The Provider

One app owns the state. It advertises a `"counter"` capability with methods (`increment`, `decrement`, `reset`) and a reactive `value$()` stream. Any app on the page can discover it.

<iframe-app height="350px" width="100%">
  <app-source>
<!DOCTYPE html>
<html>
<head>
<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 20px;
  margin: 0;
  background: #f8f9fa;
  color: #333;
}
.container {
  background: white;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
h2 {
  margin-top: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}
.count {
  font-size: 48px;
  font-weight: 600;
  text-align: center;
  margin: 20px 0;
  color: #007bff;
}
.log {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 10px;
  min-height: 100px;
  max-height: 100px;
  overflow-y: auto;
  font-size: 12px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  color: #333;
}
</style>
</head>
<body>
<div class="container">
  <h2>Coordinator Hub</h2>
  <div class="count" id="count">0</div>
  <div class="log" id="log"></div>
</div>

<script src="https://unpkg.com/rxjs@^7/dist/bundles/rxjs.umd.min.js"></script>
<script>
const { BehaviorSubject } = rxjs;

let count = 0;
const valueSubject = new BehaviorSubject(0);

function log(message) {
  const logEl = document.getElementById('log');
  const time = new Date().toLocaleTimeString();
  logEl.innerHTML = `[${time}] ${message}<br>` + logEl.innerHTML;
  console.log('[COORDINATOR]', message);
}

function updateCount(newCount) {
  count = newCount;
  document.getElementById('count').textContent = count;
  valueSubject.next(count);
  log(`Count updated to: ${count}`);
}

function initializeWidget() {
  try {
    window.charmiq.advertise('counter', {
      increment: () => {
        updateCount(count + 1);
        return count;
      },

      decrement: () => {
        updateCount(count - 1);
        return count;
      },

      reset: () => {
        updateCount(0);
        return count;
      },

      lastValue: () => {
        return count;
      },

      value$: () => {
        log('Stream subscribed');
        return valueSubject.asObservable();
      }
    });

    log('Advertised "counter" capability');

    window.charmiq.exportCommands({
      lastValue: async () => count
    });

    log('Exported "charmiq.command" surface');
    log('Ready to receive commands');
  } catch (error) {
    log(`Error: ${error.message}`);
    console.error('[COORDINATOR] Error:', error);
  }
}

log('Coordinator initializing...');
initializeWidget();
</script>
</body>
</html>
  </app-source>
</iframe-app>


## The Controller & The Observer

The left panel discovers the counter and drives it — buttons call methods across iframes. The right panel subscribes to the counter's `value$()` stream and displays updates in real time, comparing `discover$()` (observable, reconnects automatically) with `discover()` (promise, self-healing proxy).

<iframe-app height="350px" width="49%">
  <app-source>
<!DOCTYPE html>
<html>
<head>
<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 20px;
  margin: 0;
  background: #f8f9fa;
  color: #333;
}
.container {
  background: white;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
h2 {
  margin-top: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}
.buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 15px 0;
}
button {
  flex: 1;
  min-width: 80px;
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  background: #007bff;
  color: white;
  cursor: pointer;
  transition: background 0.2s;
}
button:hover:not(:disabled) {
  background: #0056b3;
}
button:active {
  transform: scale(0.98);
}
button:disabled {
  background: #adb5bd;
  cursor: not-allowed;
}
.status {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 10px;
  font-size: 12px;
  text-align: left;
  min-height: 120px;
  max-height: 120px;
  overflow-y: auto;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  color: #333;
}
</style>
</head>
<body>
<div class="container">
  <h2>Counter Controls</h2>
  <div class="buttons">
    <button id="btnInc" onclick="handleIncrement()">Increment</button>
    <button id="btnDec" onclick="handleDecrement()">Decrement</button>
    <button id="btnReset" onclick="handleReset()">Reset</button>
  </div>
  <div class="status" id="status">Initializing...</div>
</div>

<script src="https://unpkg.com/rxjs@^7/dist/bundles/rxjs.umd.min.js"></script>
<script>
let counter = undefined;

function updateStatus(text) {
  const statusEl = document.getElementById('status');
  const time = new Date().toLocaleTimeString();
  statusEl.innerHTML = `[${time}] ${text}<br>` + statusEl.innerHTML;
  console.log('[CONTROLS]', text);
}

function updateButtons(enabled) {
  document.getElementById('btnInc').disabled = !enabled;
  document.getElementById('btnDec').disabled = !enabled;
  document.getElementById('btnReset').disabled = !enabled;
}

async function handleIncrement() {
  if(!counter) { alert('Counter not available'); return; }
  try {
    const newVal = await counter.increment();
    updateStatus(`Incremented to: ${newVal}`);
    return newVal;
  } catch(error) {
    updateStatus(`Error: ${error.message}`);
  }
}

async function handleDecrement() {
  if(!counter) { alert('Counter not available'); return; }
  try {
    const newVal = await counter.decrement();
    updateStatus(`Decremented to: ${newVal}`);
    return newVal;
  } catch(error) {
    updateStatus(`Error: ${error.message}`);
  }
}

async function handleReset() {
  if(!counter) { alert('Counter not available'); return; }
  try {
    const newVal = await counter.reset();
    updateStatus(`Reset to: ${newVal}`);
  } catch(error) {
    updateStatus(`Error: ${error.message}`);
  }
}

function initializeWidget() {
  try {
    window.charmiq.discover$('counter').subscribe(counters => {
      counter = counters[0] || undefined;

      if(!counter) {
        updateStatus('Counter disconnected');
        updateButtons(false);
      } else {
        updateStatus('Counter connected');
        updateButtons(true);

        counter.lastValue().then(val => {
          updateStatus(`Initial value: ${val}`);
        });
      }
    });

    updateStatus('Discovering "counter" capability...');

    window.charmiq.exportCommands({
      increment: async () => await handleIncrement(),
      decrement: async () => await handleDecrement()
    });

    updateStatus('Exported "charmiq.command" surface');
  } catch(error) {
    updateStatus(`Error: ${error.message}`);
    console.error('[CONTROLS] Error:', error);
  }
}

updateStatus('Initializing...');
initializeWidget();
</script>
</body>
</html>
  </app-source>
</iframe-app>   <iframe-app height="400px" width="49%">
  <app-source>
<!DOCTYPE html>
<html>
<head>
<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 20px;
  margin: 0;
  background: #f8f9fa;
  color: #333;
}
.split-container {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}
.half {
  flex: 1;
  background: white;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
h2 {
  margin-top: 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}
.display {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 20px;
  margin: 15px 0;
}
.big-count {
  font-size: 48px;
  font-weight: 600;
  text-align: center;
  color: #007bff;
}
.log-container {
  background: white;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.log-title {
  font-weight: 600;
  margin-bottom: 10px;
  font-size: 14px;
  color: #333;
}
.events {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 10px;
  min-height: 80px;
  max-height: 80px;
  overflow-y: auto;
  font-size: 11px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  color: #333;
}
.event-item {
  padding: 2px 0;
  border-bottom: 1px solid #e9ecef;
}
</style>
</head>
<body>
<div class="split-container">
  <div class="half">
    <h2>Observable discover$()</h2>
    <div class="display">
      <div class="big-count" id="observableCount">-</div>
    </div>
  </div>
  <div class="half">
    <h2>Promise discover()</h2>
    <div class="display">
      <div class="big-count" id="promiseCount">-</div>
    </div>
  </div>
</div>
<div class="log-container">
  <div class="log-title">Event Log</div>
  <div class="events" id="events">
    <div class="event-item">Initializing...</div>
  </div>
</div>

<script src="https://unpkg.com/rxjs@^7/dist/bundles/rxjs.umd.min.js"></script>
<script>
const { switchMap, EMPTY } = rxjs;

let messageCount = 0;

function updateDisplay(side, count) {
  const elementId = side === 'observable' ? 'observableCount' : 'promiseCount';
  document.getElementById(elementId).textContent = count;
}

function logEvent(side, eventType, data) {
  messageCount++;
  const eventsEl = document.getElementById('events');
  const time = new Date().toLocaleTimeString();
  const sideLabel = side === 'observable' ? '[OBS]' : '[PRM]';
  const dataStr = data ? ` | ${JSON.stringify(data)}` : '';

  const eventDiv = document.createElement('div');
  eventDiv.className = 'event-item';
  eventDiv.textContent = `#${messageCount} [${time}] ${sideLabel} ${eventType}${dataStr}`;

  eventsEl.insertBefore(eventDiv, eventsEl.firstChild);
  console.log('[DISPLAY]', side, eventDiv.textContent);

  while(eventsEl.children.length > 10) {
    eventsEl.removeChild(eventsEl.lastChild);
  }
}

function initializeObservable() {
  try {
    window.charmiq.discover$('counter').pipe(
      switchMap(counters => {
        if(counters[0]) {
          logEvent('observable', 'Connected', { status: 'streaming' });
          return counters[0].value$();
        } else {
          logEvent('observable', 'Disconnected', { status: 'no provider' });
          updateDisplay('observable', '-');
          return EMPTY;
        }
      })
    ).subscribe({
      next: (value) => {
        logEvent('observable', 'Update', { value });
        updateDisplay('observable', value);
      },
      error: (err) => {
        logEvent('observable', 'Stream error', { error: err.message });
        console.error('[DISPLAY] Observable stream error:', err);
      }
    });

    logEvent('observable', 'Initialized', { discovering: 'counter' });
  } catch(error) {
    logEvent('observable', 'Error', { error: error.message });
    console.error('[DISPLAY] Observable error:', error);
  }
}

async function initializePromise() {
  try {
    const counter = await window.charmiq.discover('counter');
    logEvent('promise', 'Connected', { status: 'self-healing proxy' });

    counter.value$().pipe(
      rxjs.operators.retry()
    ).subscribe({
      next: (value) => {
        logEvent('promise', 'Update', { value });
        updateDisplay('promise', value);
      },
      error: (err) => {
        logEvent('promise', 'Stream error', { error: err.message });
        console.error('[DISPLAY] Promise stream error:', err);
      }
    });

    logEvent('promise', 'Initialized', { discovering: 'counter' });
  } catch(error) {
    logEvent('promise', 'Error', { error: error.message });
    console.error('[DISPLAY] Promise error:', error);
  }
}

logEvent('observable', 'Starting', {});
logEvent('promise', 'Starting', {});
initializeObservable();
initializePromise();
</script>
</body>
</html>
  </app-source>
</iframe-app>


## What's Happening

These three apps share no code and have no knowledge of each other at build time. They coordinate entirely through CharmIQ's `advertise` / `discover` API:

**`advertise(name, surface)`** — an app declares a named app-to-app capability with an object of methods and streams. Any other app on the page can discover it. Methods receive **positional arguments** — `proxy.foo(a, b)` arrives as `foo(a, b)`.

**`exportCommands(surface)`** — separate, MCP-flavored surface for the methods declared in the app's `manifest.json` under `commands`. Called by the host (`editor.application.call`) and by sibling apps via `discover('charmiq.command')`. Methods receive a **single named-args object** matching the manifest's `inputSchema`. (Calling `advertise('charmiq.command', ...)` throws — use `exportCommands` instead.)

**`discover$(name)`** — returns an observable that emits whenever providers of that capability connect or disconnect. The controller uses this to auto-enable its buttons when the counter appears.

**`discover(name)`** — returns a promise that resolves to a self-healing proxy. If the provider disconnects and reconnects, the proxy reconnects transparently. The observer's right panel demonstrates this.

**Streams across iframes** — the provider's `value$()` returns a `BehaviorSubject` observable. The observer subscribes to it through the proxy, receiving live updates as the controller clicks buttons. RxJS operators like `switchMap` and `retry` work normally across the boundary.

**Charms can play too** — both the provider and the controller call `exportCommands` to expose a `charmiq.command` surface. A Charm can call `lastValue` on the provider or `increment`/`decrement` on the controller, bridging the coordination API into the agent world.


## The Pattern

```
┌─────────────────────────────────────────┐
│  Provider                               │
│  advertise('counter', { ... })          │
│  exportCommands({ ... })                │
└──────────────────┬──────────────────────┘
                   │ discover$('counter')
         ┌─────────┴─────────┐
         ▼                   ▼
┌─────────────────┐ ┌─────────────────────┐
│  Controller     │ │  Observer           │
│  .increment()   │ │  .value$() stream   │
│  .decrement()   │ │  discover$() vs     │
│  .reset()       │ │  discover()         │
└─────────────────┘ └─────────────────────┘
```

No message bus. No shared state store. No event names to coordinate. Just named capabilities, method calls, and streams — the same primitives apps already use internally, now working across iframe boundaries.

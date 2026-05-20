// loadModule(name) reads the IIFE source file and evaluates it inside the
// current jsdom window. The modules bind to `window.App.*`, which we expose
// on the global so tests can reach them as `App.api`, `App.store`, …
//
// We deliberately do NOT use `require()` for these files — they aren't
// CommonJS, they're browser IIFEs that depend on a shared global.

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '..', 'js');

function loadModule(name) {
  const file = path.join(SRC_DIR, name + '.js');
  const src = fs.readFileSync(file, 'utf8');
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', 'document', 'localStorage', 'location', src);
  fn(window, window.document, window.localStorage, window.location);
}

function freshApp() {
  // Wipe the namespace between tests so loaded modules start clean.
  delete window.App;
  window.App = {};
}

module.exports = { loadModule, freshApp };

// extension/src/content-relay.ts
// Passes trades from the page script to the extension's background worker. Only accepts messages
// from this same page that have our tag and shape.

import { isRelayMessage } from './messages';

window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin || !isRelayMessage(event.data)) return;
  chrome.runtime.sendMessage({ type: 'trades', trades: event.data.trades, seenGraphql: event.data.seenGraphql, page: location.pathname }).catch(() => undefined);
});

// extension/src/content-main.ts
// Runs inside sleeper.com's page. Reads (never changes) the responses Sleeper's website already
// fetched, picks out trades, and hands only those to the relay script. It never reads cookies,
// headers, storage or your login, and never makes requests of its own.

import { findTrades, leagueIdFromUrl } from './capture';
import { RELAY_TAG, type RelayMessage } from './messages';

const MAX_BYTES = 5_000_000;
let reportedSeen = false;

const isSleeper = (url: string) => {
  try {
    const h = new URL(url, location.href).hostname;
    return h === 'sleeper.com' || h.endsWith('.sleeper.com') || h === 'sleeper.app' || h.endsWith('.sleeper.app');
  } catch {
    return false;
  }
};

function handle(url: string, body: unknown) {
  try {
    let json = body;
    if (typeof body === 'string') {
      if (body.length > MAX_BYTES || !/"trade"/.test(body)) {
        if (!reportedSeen) post([], url);
        return;
      }
      json = JSON.parse(body);
    }
    const trades = findTrades(json, leagueIdFromUrl(location.href));
    if (trades.length || !reportedSeen) post(trades, url);
  } catch {
    // not JSON, or anything unexpected: ignore, never break Sleeper
  }
}

function post(trades: RelayMessage['trades'], url: string) {
  reportedSeen = true;
  const msg: RelayMessage = { tag: RELAY_TAG, trades, seenGraphql: /graphql/.test(url) };
  window.postMessage(msg, location.origin);
}

const origFetch = window.fetch;
window.fetch = async function (this: unknown, ...args: Parameters<typeof fetch>) {
  const res = await origFetch.apply(this, args);
  try {
    if (isSleeper(res.url)) res.clone().text().then(t => handle(res.url, t), () => undefined);
  } catch {
    // ignore
  }
  return res;
} as typeof fetch;

// One load listener per XHR object; it reads whichever URL that object last opened.
const xhrUrl = new WeakMap<XMLHttpRequest, string>();
const origOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
  if (!xhrUrl.has(this)) {
    this.addEventListener('load', () => {
      const u = xhrUrl.get(this) ?? '';
      if (!isSleeper(u)) return;
      try {
        const body = this.responseType === '' || this.responseType === 'text' ? this.responseText : this.responseType === 'json' ? this.response : null;
        if (body != null) handle(u, body);
      } catch {
        // ignore
      }
    });
  }
  xhrUrl.set(this, String(url));
  return (origOpen as any).call(this, method, url, ...rest);
} as typeof XMLHttpRequest.prototype.open;

// scripts/e2e-extension.mjs
// End-to-end check of the built extension (npm run build:extension first): loads it in Chromium,
// serves a fake sleeper.com page that fetches a GraphQL response with a pending trade, and checks
// the popup's "Check what I see" lists it. Nothing touches the real Sleeper or Firebase.
//   node scripts/e2e-extension.mjs

import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright may be installed globally; require() finds it where import can't.
const { chromium } = createRequire(import.meta.url)('playwright');
const dist = fileURLToPath(new URL('../extension/dist', import.meta.url));
const shot = process.argv[2];

const graphql = {
  data: {
    league_transactions_filtered: [
      { transaction_id: '9', type: 'trade', status: 'proposed', league_id: '1180', roster_ids: [1, 4], creator: 'u4',
        adds: { '6794': 1, '4866': 4 }, drops: { '6794': 4, '4866': 1 }, metadata: { note: 'not captured' } },
    ],
  },
};
const page = `<!doctype html><title>Sleeper</title><p>league</p><script>
  // One XHR object reused twice (Sleeper-style polling), then a fetch.
  const x = new XMLHttpRequest();
  x.onload = () => { x.onload = null; x.open('POST', 'https://sleeper.com/graphql'); x.send('{}'); };
  x.open('POST', 'https://sleeper.com/graphql'); x.send('{}');
  fetch('https://sleeper.com/graphql', { method: 'POST', body: '{}' }).then(r => r.json()).then(() => setTimeout(() => document.title = 'loaded', 500));
</script>`;

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'ffh-ext-')), {
  headless: true,
  channel: 'chromium', // the full Chromium build (new headless) can load extensions
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
// Keep everything offline: fake Sleeper, block Firebase.
await ctx.route('https://sleeper.com/graphql', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(graphql) }));
await ctx.route('https://sleeper.com/leagues/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: page }));
await ctx.route(/googleapis\.com/, r => r.abort());

let [worker] = ctx.serviceWorkers();
worker ??= await ctx.waitForEvent('serviceworker');
const extId = new URL(worker.url()).host;

const tab = await ctx.newPage();
await tab.goto('https://sleeper.com/leagues/1180/trades');
await tab.waitForFunction(() => document.title === 'loaded');
await tab.waitForTimeout(1500);

const popup = await ctx.newPage();
await popup.setViewportSize({ width: 340, height: 420 });
await popup.goto(`chrome-extension://${extId}/popup.html`);
const status = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'status' }));
const captured = status.captures.filter(c => c.transactionId === '9' && c.status === 'proposed');
console.log(`captured ${captured.length} trade(s); rosters ${captured[0]?.rosterIds?.join(', ')}; league ${captured[0]?.leagueId}; saw Sleeper: ${status.seenSleeper}`);

// Wrong-shaped code is rejected before any network call.
await popup.fill('#code', 'abc');
await popup.click('button[type=submit]');
await popup.waitForTimeout(300);
console.log(`bad code message: ${await popup.textContent('#error')}`);
if (shot) await popup.screenshot({ path: shot });

await ctx.close();
if (captured.length !== 1 || !status.seenSleeper) process.exit(1);

// extension/src/popup.ts
// Connect with a code, see what's linked, and "Check what I see" for troubleshooting.

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const send = <T>(msg: unknown) => chrome.runtime.sendMessage(msg) as Promise<T>;

type Status = {
  link: { uid: string; label: string; linkedAt: number } | null;
  unlinked: boolean;
  lastSyncAt: number | null;
  captures: { transactionId: string; status: string; rosterIds: number[]; leagueId: string | null; at: number }[];
  seenSleeper: boolean;
};

const ERRORS: Record<string, string> = {
  invalid: 'Codes are 8 letters and numbers, like ABCD-EFGH.',
  expired_or_used: 'That code expired or was already used. Make a new one in the app.',
  network: "Couldn't reach FF Helper. Check your connection and try again.",
};

const ago = (t: number) => {
  const m = Math.floor((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
};

async function render() {
  const s = await send<Status>({ type: 'status' });
  $('link').hidden = !!s.link;
  $('linked').hidden = !s.link;
  $('unlinked-note').hidden = !s.unlinked;
  if (s.link) {
    $('linked-text').textContent = `Linked to ${s.link.label}. Pending offers you see on sleeper.com show in the app's Trades tab.`;
    $('sync').textContent = s.lastSyncAt ? `Last saved offers ${ago(s.lastSyncAt)}.` : 'Open your league on sleeper.com to send your offers.';
  }
  return s;
}

$('form').addEventListener('submit', async e => {
  e.preventDefault();
  $('error').textContent = '';
  const r = await send<{ ok?: true; error?: string }>({ type: 'claim', code: $<HTMLInputElement>('code').value });
  if (r?.error) $('error').textContent = ERRORS[r.error] ?? ERRORS.network;
  else render();
});

$('unlink').addEventListener('click', async () => {
  await send({ type: 'unlink' });
  render();
});

$('check').addEventListener('click', async () => {
  const s = await render();
  const lines = [
    s.seenSleeper ? 'Saw Sleeper data in this browser session: yes' : 'Saw Sleeper data in this browser session: no (open your league on sleeper.com)',
    `Trades captured: ${s.captures.length}`,
    ...s.captures.map(c => `#${c.transactionId}  ${c.status}  rosters ${c.rosterIds.join(', ')}  league ${c.leagueId ?? '?'}  ${ago(c.at)}`),
  ];
  $('debug-text').textContent = lines.join('\n');
  $('debug').hidden = false;
});

$('copy').addEventListener('click', () => navigator.clipboard.writeText($('debug-text').textContent ?? ''));

render();

# FF Helper browser extension: privacy

**What it does.** While you have sleeper.com open, the extension looks at the trade information
Sleeper's own website loads for you and sends the pending trades to your FF Helper account, so
the FF Helper app can show and grade them.

**What it collects.** Only trade details: the trade's id, league id, status, which rosters are in
it, which players and draft picks move, and when it was made. Nothing else from Sleeper.

**What it never collects.** Your Sleeper password, login token, cookies, messages or any other
website. It doesn't make requests to Sleeper on its own and can't send, accept or change trades.

**Where it goes.** To your FF Helper account in Google Firebase (Firestore). Only you can read it.
Linking uses a one-time code and an anonymous Firebase sign-in for the extension.

**Your control.** Unlink the browser in the extension or in the app (Browser extension page) to
stop it. Removing the extension stops it completely.

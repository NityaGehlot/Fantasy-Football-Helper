// app/services/sleeperTrade.ts
// Sleeper's public API is read-only, so a trade can't be submitted for the user.
// Instead: copy a ready-to-send summary of the trade, then open the league in Sleeper
// so the user can pick the players and send it (or paste the message in league chat).

import { Linking, Platform, Share } from 'react-native';
import { buildTradeMessage, sleeperLeagueUrl, type TradeIdea } from './tradeFormat';

export { buildTradeMessage, sleeperLeagueUrl, tradeSteps } from './tradeFormat';

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const clipboard = (globalThis as any)?.navigator?.clipboard;
    if (Platform.OS === 'web' && clipboard?.writeText) {
      await clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the share sheet
  }
  return false;
}

/**
 * Copy (web) or share (mobile) the trade message, then open the league on Sleeper.
 * Returns how the message was handed off so the UI can tell the user.
 */
export async function proposeTradeInSleeper(leagueId: string, idea: TradeIdea): Promise<'copied' | 'shared' | 'opened'> {
  const message = buildTradeMessage(idea);
  let result: 'copied' | 'shared' | 'opened' = 'opened';

  if (await copyToClipboard(message)) {
    result = 'copied';
  } else if (Platform.OS !== 'web') {
    try {
      await Share.share({ message });
      result = 'shared';
    } catch {
      // user dismissed the share sheet
    }
  }

  await Linking.openURL(sleeperLeagueUrl(leagueId)).catch(err => console.warn('Could not open Sleeper:', err));
  return result;
}

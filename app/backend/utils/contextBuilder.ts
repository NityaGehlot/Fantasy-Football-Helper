// app/backend/utils/contextBuilder.ts
// Factory for building context for any position

import { buildQBContext } from "./buildQBContext";
import { buildWRContext } from "./buildWRContext";
import { buildTEContext } from "./buildTEContext";
import { buildRBContext } from "./buildRBContext";
import { buildKContext } from "./buildKContext";
import { buildDEFContext } from "./buildDEFContext";
import { Position } from "./playerExtraction";

/**
 * Get the context builder for a given position
 */
export function getContextBuilder(position: Position) {
  const builders: { [key in Position]: any } = {
    QB: buildQBContext,
    WR: buildWRContext,
    TE: buildTEContext,
    RB: buildRBContext,
    DEF: buildDEFContext,
    K: buildKContext,
  };
  return builders[position];
}

/**
 * Build context for multiple players
 */
export function buildPlayerContexts(
  playerNames: string[],
  positions: Position[],
  playerStats: any[]
) {
  const contexts: { name: string; position: Position; ctx: any }[] = [];

  for (let i = 0; i < playerNames.length; i++) {
    const name = playerNames[i];
    const position = positions[i];

    // Import the player extraction to get weeks
    const { getPlayerWeeks } = require("./playerExtraction");
    const weeks = getPlayerWeeks(name, position, playerStats);

    const builder = getContextBuilder(position);
    const ctx = builder(weeks);

    contexts.push({
      name,
      position,
      ctx,
    });
  }

  return contexts;
}

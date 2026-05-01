// app/backend/ARCHITECTURE.md
# Fantasy Football Chatbot - Refactored Architecture

## Overview

This document explains the new modular architecture that makes it easy to add support for new positions (WR, TE, RB, DEF, K) and new features (trades, drops, etc.).

## Directory Structure

```
app/backend/
├── chatbotProxy.ts              # Main Express server (coordinator)
├── utils/
│   ├── playerExtraction.ts      # Generic player data extraction
│   ├── statsFormatter.ts        # Shared stat calculation utilities
│   ├── contextBuilder.ts        # Factory for position builders
│   ├── buildQBContext.ts        # QB-specific context builder
│   ├── buildWRContext.ts        # WR-specific context builder
│   ├── buildTEContext.ts        # TE-specific context builder
│   ├── buildRBContext.ts        # RB-specific context builder
│   ├── buildDEFContext.ts       # (TODO) DEF context builder
│   └── buildKickerContext.ts    # (TODO) K context builder
└── services/
    ├── playerAnalysis.ts        # Build formatted analysis blocks
    ├── comparisonService.ts     # Generic player comparisons
    ├── promptBuilder.ts         # AI prompt construction
    └── conversationHandler.ts   # (TODO) Route questions to right handler
```

## Key Components

### 1. Player Extraction (`utils/playerExtraction.ts`)

Generic utilities for extracting player data regardless of position:

- `extractPlayerNames(message, stats, position)` - Find specific position players in message
- `extractAllPlayers(message, stats)` - Find any players mentioned
- `getPlayerWeeks(name, position, stats)` - Get formatted weekly data for a player
- `getInjuredTeammates(team, stats, week)` - Find injured players on a team
- `getPlayerTeam(name, position, stats)` - Get player's current team
- `getPlayerInjuryStatus(name, position, stats, week)` - Get injury info

### 2. Stats Formatters (`utils/statsFormatter.ts`)

Shared utilities for calculations:

- `sum()` - Sum values across weeks
- `calculateConsistency()` - Score a player's week-to-week consistency
- `getLastNWeeks()` - Get last N weeks of data
- `filterByWeeks()` - Filter data to specific weeks

### 3. Context Builders (`utils/buildXContext.ts`)

Each position gets its own builder:

- `buildQBContext(weeks)` - Returns QB stats (pass yards, TDs, INTs, etc.)
- `buildWRContext(weeks)` - Returns WR stats (targets, receptions, yards, etc.)
- `buildTEContext(weeks)` - Returns TE stats (same as WR)
- `buildRBContext(weeks)` - Returns RB stats (rush + receiving)

**Pattern for adding a new position builder:**

```typescript
import { PlayerContext, sum, calculateConsistency, getLastNWeeks, filterByWeeks } from "./statsFormatter";

export function buildDEFContext(defWeeks: any[]): PlayerContext | { error: string } {
  if (!defWeeks || defWeeks.length === 0) {
    return { error: "No DEF data available" };
  }

  const filtered = filterByWeeks(defWeeks, 16);
  const sorted = [...filtered].sort((a, b) => Number(b.week) - Number(a.week));
  const last3 = getLastNWeeks(sorted, 3);
  const latest = sorted[0];

  const totalGames = sorted.length;

  // Calculate your position-specific stats
  const sacks = sum(sorted, "sacks");
  const interceptionsDef = sum(sorted, "interceptionsDef");
  // ... etc

  // Build last3Summary with position-specific keys
  const last3Summary = {
    gamesIncluded: last3.length,
    weeksIncluded: last3.map(w => w.week).sort((a, b) => b - a),
    avgFantasyPts: Number((sum(last3, "fantasyPoints") / last3.length).toFixed(2)),
    avgSacks: Number((sum(last3, "sacks") / last3.length).toFixed(1)),
    // ... position-specific stats
  };

  return {
    gamesPlayed: totalGames,
    sacks,
    interceptionsDef,
    // ... other stats
    last3Summary,
    consistencyScore: calculateConsistency(seasonPoints, fantasyAvg),
    injuryStatus: latest.injury_status || "ACTIVE",
    practiceStatus: latest.practice_status || "",
    injuryType: latest.primary_injury || "None",
  };
}
```

### 4. Player Analysis (`services/playerAnalysis.ts`)

Builds formatted analysis blocks for display:

- `buildQBAnalysisBlock()` - Formats QB data for AI prompt
- `buildWRAnalysisBlock()` - Formats WR data for AI prompt
- `buildTEAnalysisBlock()` - Formats TE data for AI prompt
- `buildRBAnalysisBlock()` - Formats RB data for AI prompt

**Pattern for adding new position analysis:**

```typescript
export function buildDEFAnalysisBlock(
  teamName: string,
  ctx: any,
  playerStats: any[],
  currentWeek: number
): string {
  const injuryInfo = getPlayerInjuryStatus(teamName, "DEF", playerStats, currentWeek);

  return `
${teamName.toUpperCase()} (DEF)
--- SEASON (Wk 1-16) ---
Games Played:         ${ctx.gamesPlayed}
Season Avg (PPR):     ${ctx.fantasyAvg}
Total Sacks:          ${ctx.sacks}
Total INTs:           ${ctx.interceptionsDef}
Def TDs:              ${ctx.defensiveTD}
Consistency (0-1):    ${ctx.consistencyScore}

--- LAST 3 WEEKS AVG (Weeks: ${ctx.last3Summary.weeksIncluded.join(", ")}) ---
Avg Fantasy Pts:      ${ctx.last3Summary.avgFantasyPts}
Avg Sacks:            ${ctx.last3Summary.avgSacks}
...
`;
}
```

### 5. Comparison Service (`services/comparisonService.ts`)

Generic comparisons for any players:

- `comparePlayerStats(playerA, playerB, statConfigs)` - Compare two players
- `formatComparisonBlock()` - Format for AI prompt
- `getStatLeader()` - Determine winner of a stat

**Usage:**

```typescript
const comparisons = comparePlayerStats(
  playerA,
  playerB,
  [
    { key: "avgFantasyPts", label: "Avg Fantasy Pts", dataSource: "last3Summary" },
    { key: "avgReceivingYards", label: "Avg Rec Yds", dataSource: "last3Summary" },
    { key: "consistencyScore", label: "Consistency" },
  ]
);
```

### 6. Prompt Builder (`services/promptBuilder.ts`)

Constructs AI prompts dynamically:

- `buildSystemInstructions()` - Base system prompt
- `buildAnalysisPrompt()` - Complete prompt for AI
- `buildQBResponseFormat()` - Expected output format
- `buildSkillPositionResponseFormat()` - Generic format for non-QB

## Flow: How a Question Gets Answered

1. **User sends message** to `/fantasy-chat` endpoint
2. **Extract players** using `extractAllPlayers()` (any position)
3. **For each player:**
   - Get weekly data using `getPlayerWeeks()`
   - Get context builder using `getContextBuilder(position)`
   - Build context using position-specific builder
   - Build analysis block using position-specific analyzer
4. **If multiple players of same position:**
   - Run `comparePlayerStats()` with position-specific stats
   - Format comparison using `formatComparisonBlock()`
5. **Build AI prompt** using `buildAnalysisPrompt()`
6. **Call Ollama** with prompt
7. **Return formatted response**

## Adding Support for a New Position

### Step 1: Create Context Builder

Create `utils/buildNEWContext.ts`:

```typescript
import { PlayerContext, sum, calculateConsistency, getLastNWeeks, filterByWeeks } from "./statsFormatter";

export function buildNEWContext(weeks: any[]): PlayerContext | { error: string } {
  // ... calculate stats
  return { /* context */ };
}
```

### Step 2: Create Analysis Block Builder

Add to `services/playerAnalysis.ts`:

```typescript
export function buildNEWAnalysisBlock(
  playerName: string,
  ctx: any,
  playerStats: any[],
  currentWeek: number
): string {
  // ... format block
  return `...`;
}
```

### Step 3: Update Context Builder Factory

In `utils/contextBuilder.ts`:

```typescript
import { buildNEWContext } from "./buildNEWContext";

export function getContextBuilder(position: Position) {
  const builders: { [key in Position]: any } = {
    // ... existing
    NEW: buildNEWContext,  // ← Add this
  };
  return builders[position];
}
```

### Step 4: Update Analysis Builder Getter

In `services/playerAnalysis.ts`:

```typescript
export function getAnalysisBuilder(position: Position) {
  const builders: { [key in Position]: any } = {
    // ... existing
    NEW: buildNEWAnalysisBlock,  // ← Add this
  };
  return builders[position];
}
```

### Step 5: Define Comparison Stats (Optional)

In `chatbotProxy.ts`, update the stat configs when building comparisons.

## Adding Support for New Features

### For Trades, Drops, etc.

1. Create `services/tradeAnalysis.ts`
2. Add trade comparison logic
3. Create `services/conversationHandler.ts` to route questions
4. Update `/fantasy-chat` endpoint to detect question type
5. Call appropriate handler (comparison vs. trade vs. drop)

## Key Design Principles

1. **Position Builders are Independent** - Each position builder focuses only on its stats
2. **Generic Utilities** - Extraction, comparison, and formatting are position-agnostic
3. **Composition** - New features are built by composing existing services
4. **Separation of Concerns**:
   - `utils/` = Data extraction and calculation
   - `services/` = Business logic and formatting
   - `chatbotProxy.ts` = HTTP coordination
5. **Easy to Extend** - Adding a new position requires ~4 simple additions

## Testing the New Architecture

### Test QB comparison (existing):

```bash
curl -X POST http://localhost:4000/fantasy-chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Who should I start: Patrick Mahomes or Josh Allen?"}'
```

### Test WR comparison (once added):

```bash
curl -X POST http://localhost:4000/fantasy-chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Who should I start: Justin Jefferson or Ja\'Marr Chase?"}'
```

## Next Steps

1. Test QB comparison works with new architecture
2. Add WR/TE/RB support (same pattern)
3. Add DEF/K support (different stats, same pattern)
4. Add trade analysis logic
5. Add drop analysis logic

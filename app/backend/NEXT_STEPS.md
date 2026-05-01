// app/backend/NEXT_STEPS.md
# Implementation Checklist

## Phase 1: Verify Current Setup ✅ (Done)

- [x] Refactored chatbotProxy.ts to use modular services
- [x] Created utils/playerExtraction.ts (generic)
- [x] Created utils/statsFormatter.ts (generic)
- [x] Created utils/contextBuilder.ts (factory pattern)
- [x] Kept existing buildQBContext.ts
- [x] Created buildWRContext.ts
- [x] Created buildTEContext.ts
- [x] Created buildRBContext.ts
- [x] Created services/playerAnalysis.ts (all positions)
- [x] Created services/comparisonService.ts (generic)
- [x] Created services/promptBuilder.ts (generic)

## Phase 2: Test Current Implementation (Next)

### Test 1: QB vs QB (existing, should still work)
```bash
# In terminal
npm run dev

# In another terminal
curl -X POST http://localhost:4000/fantasy-chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Should I start Patrick Mahomes or Josh Allen?"}'
```

**Expected:** 
- ✅ Detects both QBs
- ✅ Shows comparison
- ✅ Makes start/sit recommendation

### Test 2: WR vs WR (new, should work now)
```bash
curl -X POST http://localhost:4000/fantasy-chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Who should I start: Justin Jefferson or Ja'\''Marr Chase?"}'
```

**Expected:**
- ✅ Detects both WRs
- ✅ Shows comparison of receiving yards, TDs, targets
- ✅ Makes start/sit recommendation

### Test 3: RB vs RB (new, should work)
```bash
curl -X POST http://localhost:4000/fantasy-chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Start Jonathan Taylor or Derrick Henry?"}'
```

**Expected:**
- ✅ Detects both RBs
- ✅ Shows rushing + receiving comparison
- ✅ Makes recommendation

### Test 4: TE vs TE (new, should work)
```bash
curl -X POST http://localhost:4000/fantasy-chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Travis Kelce or Mark Andrews?"}'
```

**Expected:**
- ✅ Detects both TEs
- ✅ Shows comparison
- ✅ Makes recommendation

### Test 5: Mixed Positions (QB + WR)
```bash
curl -X POST http://localhost:4000/fantasy-chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Should I start Mahomes or Justin Jefferson?"}'
```

**Expected:**
- ✅ Shows both (no direct comparison)
- ✅ Analyzes each individually
- ✅ Recommends better option (AI decides)

**If any test fails:**
- [ ] Check console for error messages
- [ ] Verify player names match exactly in JSON
- [ ] Check if stats are populated for that week
- [ ] Review line numbers in error

## Phase 3: Complete Missing Positions

### Add DEF Support
- [ ] Create `utils/buildDEFContext.ts`
- [ ] Add DEF stats (sacks, INTs, DEF TDs, points allowed)
- [ ] Add `buildDEFAnalysisBlock()` to playerAnalysis.ts
- [ ] Update `contextBuilder.ts` factory
- [ ] Update builder getter in playerAnalysis.ts
- [ ] Test DEF vs DEF comparison

### Add Kicker Support
- [ ] Create `utils/buildKickerContext.ts`
- [ ] Add kicker stats (FG, PAT, points)
- [ ] Add `buildKickerAnalysisBlock()` to playerAnalysis.ts
- [ ] Update `contextBuilder.ts` factory
- [ ] Update builder getter in playerAnalysis.ts
- [ ] Test Kicker vs Kicker comparison

### Add Flex Position Support
- [ ] Create `utils/buildFlexContext.ts` (generic for RB/WR/TE)
- [ ] Support comparing across position categories
- [ ] Add to playerAnalysis.ts

## Phase 4: New Features

### Trade Analysis
- [ ] Create `services/tradeAnalysis.ts`
- [ ] Add `analyzeTrade(giveList, getList)` function
- [ ] Parse "trade X for Y" questions
- [ ] Compare total fantasy avg both sides
- [ ] Recommend ACCEPT/DECLINE
- [ ] Test trade questions

### Drop Analysis
- [ ] Create `services/dropAnalysis.ts`
- [ ] Parse "drop X or Y" questions
- [ ] Compare remaining schedules
- [ ] Compare consistency scores
- [ ] Recommend which to drop
- [ ] Test drop questions

### Waiver Wire Analysis
- [ ] Create `services/waiverAnalysis.ts`
- [ ] Support "pick up X" questions
- [ ] Compare player to drop vs pickup
- [ ] Factor in bye weeks
- [ ] Test waiver questions

## Phase 5: Optimization

- [ ] Add caching for player stats (reduce API calls)
- [ ] Add error handling for missing player data
- [ ] Add input validation
- [ ] Add response caching (same question = same answer)
- [ ] Add logging for debugging
- [ ] Add rate limiting

## Files Ready to Use

```
✅ READY TO USE (implement immediately):
  ├── app/backend/chatbotProxy.ts (refactored)
  ├── app/backend/utils/playerExtraction.ts
  ├── app/backend/utils/statsFormatter.ts
  ├── app/backend/utils/contextBuilder.ts
  ├── app/backend/utils/buildWRContext.ts
  ├── app/backend/utils/buildTEContext.ts
  ├── app/backend/utils/buildRBContext.ts
  ├── app/backend/services/playerAnalysis.ts
  ├── app/backend/services/comparisonService.ts
  └── app/backend/services/promptBuilder.ts

✅ EXISTING (still works):
  └── app/backend/utils/buildQBContext.ts

⏳ TODO (placeholder structures exist):
  ├── app/backend/utils/buildDEFContext.ts
  ├── app/backend/utils/buildKickerContext.ts
  └── app/backend/services/conversationHandler.ts
```

## Code Patterns to Follow

### Creating a New Position Builder

```typescript
// app/backend/utils/buildNEWContext.ts

import {
  PlayerContext,
  sum,
  calculateConsistency,
  getLastNWeeks,
  filterByWeeks
} from "./statsFormatter";

export function buildNEWContext(newWeeks: any[]): PlayerContext | { error: string } {
  if (!newWeeks || newWeeks.length === 0) {
    return { error: "No NEW data available" };
  }

  const filtered = filterByWeeks(newWeeks, 16);
  const sorted = [...filtered].sort((a, b) => Number(b.week) - Number(a.week));
  const last3 = getLastNWeeks(sorted, 3);
  const latest = sorted[0];
  const totalGames = sorted.length;

  // POSITION-SPECIFIC STATS
  const stat1 = sum(sorted, "stat1");
  const stat2 = sum(sorted, "stat2");

  const last3Summary = {
    gamesIncluded: last3.length,
    weeksIncluded: last3.map(w => w.week).sort((a, b) => b - a),
    avgFantasyPts: Number((sum(last3, "fantasyPoints") / last3.length).toFixed(2)),
    avgStat1: Number((sum(last3, "stat1") / last3.length).toFixed(1)),
    avgStat2: Number((sum(last3, "stat2") / last3.length).toFixed(2)),
  };

  return {
    gamesPlayed: totalGames,
    stat1,
    stat2,
    last3Summary,
    consistencyScore: calculateConsistency(
      sorted.map(w => Number(w.fantasyPoints) || 0),
      sum(sorted, "fantasyPoints") / totalGames
    ),
    injuryStatus: latest.injury_status || "ACTIVE",
    practiceStatus: latest.practice_status || "",
    injuryType: latest.primary_injury || "None",
  };
}
```

### Adding to Player Analysis

```typescript
// In app/backend/services/playerAnalysis.ts

export function buildNEWAnalysisBlock(
  playerName: string,
  ctx: any,
  playerStats: any[],
  currentWeek: number
): string {
  const team = getPlayerTeam(playerName, "NEW", playerStats);
  const injuryInfo = getPlayerInjuryStatus(playerName, "NEW", playerStats, currentWeek);

  return `
${playerName.toUpperCase()} (NEW)
--- SEASON (Wk 1-16) ---
Games Played:         ${ctx.gamesPlayed}
Season Avg (PPR):     ${ctx.fantasyAvg}
Total Stat1:          ${ctx.stat1}
Total Stat2:          ${ctx.stat2}
Consistency (0-1):    ${ctx.consistencyScore}

--- LAST 3 WEEKS AVG (Weeks: ${ctx.last3Summary.weeksIncluded.join(", ")}) ---
Avg Fantasy Pts:      ${ctx.last3Summary.avgFantasyPts}
Avg Stat1:            ${ctx.last3Summary.avgStat1}
Avg Stat2:            ${ctx.last3Summary.avgStat2}

--- INJURY (Week ${currentWeek} data) ---
Status:               ${injuryInfo.status}
Practice:             ${injuryInfo.practiceStatus}
Injury Type:          ${injuryInfo.injuryType}
`;
}
```

## Questions to Answer During Testing

1. **Does QB comparison still work perfectly?** (Baseline test)
2. **Do player names get detected correctly for WR/TE/RB?**
3. **Are stats formatted correctly for each position?**
4. **Do comparisons make sense?** (Higher values = player leads)
5. **Does AI follow the instructions?** (No recalculation, use pre-computed)
6. **Are injury statuses showing correctly?**

## Debug Commands

```bash
# Check if Ollama is running
curl http://127.0.0.1:11434/api/tags

# Check if backend is running
curl http://localhost:4000/player-stats-all-weeks | head -20

# Test player extraction
node -e "
const { extractAllPlayers } = require('./utils/playerExtraction.ts');
const stats = require('./data.json');
console.log(extractAllPlayers('Mahomes vs Jefferson', stats));
"
```

## Success Criteria

✅ Phase 1 Complete when:
- [ ] All files created without errors
- [ ] TypeScript compiles
- [ ] No unused imports
- [ ] Proper error handling

✅ Phase 2 Complete when:
- [ ] Test 1 (QB) passes
- [ ] Test 2 (WR) passes
- [ ] Test 3 (RB) passes
- [ ] Test 4 (TE) passes
- [ ] Test 5 (Mixed) passes

✅ Phase 3 Complete when:
- [ ] DEF builder created
- [ ] Kicker builder created
- [ ] All positions detected and compared

✅ Phase 4 Complete when:
- [ ] Trade analysis works
- [ ] Drop analysis works
- [ ] Waiver analysis works

---

**Current Status: Phase 1 ✅ Complete**

**Next: Run Phase 2 tests to verify everything works!**

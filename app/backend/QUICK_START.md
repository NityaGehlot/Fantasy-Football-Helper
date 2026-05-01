// app/backend/QUICK_START.md
# Quick Reference: Adding New Position Support

## What Was Refactored?

Your original `chatbotProxy.ts` was all-in-one. Now it's **modular**:

```
BEFORE (monolithic):
  chatbotProxy.ts (450+ lines, all QB logic)
    
AFTER (composable):
  chatbotProxy.ts (175 lines, just coordination)
  ├─ utils/playerExtraction.ts (generic player finding)
  ├─ utils/statsFormatter.ts (shared math)
  ├─ utils/buildQBContext.ts (QB-specific)
  ├─ utils/buildWRContext.ts (WR-specific)
  ├─ utils/buildTEContext.ts (TE-specific)
  ├─ utils/buildRBContext.ts (RB-specific)
  ├─ services/playerAnalysis.ts (format display blocks)
  ├─ services/comparisonService.ts (compare any players)
  └─ services/promptBuilder.ts (build AI prompts)
```

## Why This Design?

1. **No Duplicated Logic** - `extractAllPlayers()` works for QB, WR, TE, RB, DEF, K
2. **Consistent Pattern** - Each position follows the same builder pattern
3. **Easy Comparisons** - Generic `comparePlayerStats()` works for any position
4. **Future-Ready** - Trades, drops, etc. just compose existing services

## Adding WR Support (Example)

You already have `buildWRContext.ts` ready! Here's the checklist:

- [x] Created `buildWRContext.ts` ✅
- [x] Created `buildTEContext.ts` ✅  
- [x] Created `buildRBContext.ts` ✅
- [x] Created `playerAnalysis.ts` with all position builders ✅
- [x] Updated `contextBuilder.ts` factory ✅
- [x] Updated main `chatbotProxy.ts` to use all builders ✅

**Just test it!** The system now auto-detects WR, TE, RB players.

## Testing Positions

### QB vs QB (existing):
```
User: "Should I start Mahomes or Allen?"
→ Detects: QB, QB
→ Uses: buildQBContext for both
→ Compares: Pass yards, TDs, INTs, etc.
```

### WR vs WR (ready to test!):
```
User: "Who should I start: Jefferson or Chase?"
→ Detects: WR, WR
→ Uses: buildWRContext for both
→ Compares: Targets, receptions, yards, etc.
```

### RB vs RB (ready to test!):
```
User: "Start Taylor or Henry?"
→ Detects: RB, RB
→ Uses: buildRBContext for both
→ Compares: Rush yards, receiving yards, TDs, etc.
```

### Mixed Positions (works too!):
```
User: "Start Mahomes or Justin Jefferson?"
→ Detects: QB, WR
→ Uses: different builders for each
→ Shows individual analysis (no comparison)
```

## Adding DEF or K Support

Same 5-step pattern:

1. Create `utils/buildDEFContext.ts`
2. Add `buildDEFAnalysisBlock()` to `services/playerAnalysis.ts`
3. Update `contextBuilder.ts` factory
4. Update `playerAnalysis.ts` builder getter
5. Define comparison stats in `chatbotProxy.ts`

## Next Major Features

Once all positions work, the next layer:

### Trade Analysis
```
User: "Should I trade Jefferson for Hill?"
→ Compare both sides of trade
→ Rate each side
→ Recommend
```

### Drop Analysis
```
User: "Should I drop Smith or Davis?"
→ Compare week-by-week
→ Check remaining schedule
→ Recommend
```

### Flex Optimization
```
User: "What's my best flex: Johnson (RB), Brown (WR), or Smith (TE)?"
→ Compare all three
→ Recommend highest ceiling/floor
```

These all build on the existing position comparison logic!

## File Purposes at a Glance

| File | Purpose | When Adding New Feature |
|------|---------|------------------------|
| `playerExtraction.ts` | Find players in message | Rarely touch—it's generic |
| `statsFormatter.ts` | Shared math functions | Rarely touch—it's generic |
| `buildXContext.ts` | Calculate position stats | Create new one per position |
| `playerAnalysis.ts` | Format stats for AI | Add builder function per position |
| `comparisonService.ts` | Compare players | Rarely touch—it's generic |
| `promptBuilder.ts` | Build AI prompts | Add format builder per feature |
| `chatbotProxy.ts` | Route requests | Update stat configs per position |

## Key Insight

The **position builders** (QB, WR, TE, RB) all return the same shape:

```typescript
{
  gamesPlayed: number,
  fantasyAvg: number,
  last3Avg: number,
  last3Summary: { /* position-specific stats */ },
  consistencyScore: number,
  injuryStatus: string,
  // Position-specific stats here
  receivingYards?: number,
  rushingYards?: number,
  passingYards?: number,
  // etc
}
```

This allows `comparisonService.ts` to work generically—it doesn't care about QB vs WR!

## Troubleshooting

**Q: "How do I add Kicker support?"**
A: Create `buildKickerContext.ts`, add its analysis builder, update factories. 5 min.

**Q: "Will comparisons work for mixed positions (QB vs WR)?"**
A: Yes, but they won't compare. The system shows individual analysis only.

**Q: "Where do I add logic for 'trade Mahomes for Jefferson'?"**
A: New file `services/tradeAnalysis.ts` + update `conversationHandler.ts` to route questions.

**Q: "Do I need to update player stats schema?"**
A: If your JSON has new fields, update `getPlayerWeeks()` in `playerExtraction.ts`.

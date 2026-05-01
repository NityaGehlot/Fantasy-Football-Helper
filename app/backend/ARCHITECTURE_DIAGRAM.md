// app/backend/ARCHITECTURE_DIAGRAM.md
# Architecture Diagram & Data Flow

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Express Server                           │
│                    (chatbotProxy.ts - 175 lines)                 │
│                                                                   │
│  Endpoints:                                                       │
│  ├── GET  /player-stats-week/:week                               │
│  ├── GET  /player-stats-all-weeks                                │
│  └── POST /fantasy-chat  ← Main endpoint                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Data Access Layer                             │
│                      (utils/ folder)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  playerExtraction.ts (140 lines)                                 │
│  ├── extractAllPlayers()          ← Find QB, WR, TE, RB, etc    │
│  ├── getPlayerWeeks()             ← Format weekly data          │
│  ├── getPlayerTeam()              ← Find team                   │
│  ├── getPlayerInjuryStatus()      ← Get injury info             │
│  └── getInjuredTeammates()        ← Find hurt teammates         │
│                                                                   │
│  statsFormatter.ts (50 lines)                                    │
│  ├── sum()                        ← Add stats across weeks      │
│  ├── calculateConsistency()       ← Measure variance            │
│  ├── getLastNWeeks()              ← Get N most recent           │
│  └── filterByWeeks()              ← Limit to weeks 1-16         │
│                                                                   │
│  contextBuilder.ts (40 lines)                                    │
│  └── getContextBuilder()          ← Factory for positions       │
│                                                                   │
│  buildQBContext.ts (80 lines)                                    │
│  buildWRContext.ts (60 lines)    ← 5 position builders          │
│  buildTEContext.ts (60 lines)     (Same pattern, different stats)
│  buildRBContext.ts (75 lines)                                    │
│  [buildDEFContext.ts - TODO]                                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Business Logic Layer                           │
│                  (services/ folder)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  playerAnalysis.ts (180 lines)                                   │
│  ├── buildQBAnalysisBlock()       ← Format QB data              │
│  ├── buildWRAnalysisBlock()       ← Format WR data              │
│  ├── buildTEAnalysisBlock()       ← Format TE data              │
│  ├── buildRBAnalysisBlock()       ← Format RB data              │
│  └── getAnalysisBuilder()         ← Factory for analyzers       │
│                                                                   │
│  comparisonService.ts (60 lines)                                 │
│  ├── comparePlayerStats()         ← Compare any players         │
│  ├── formatComparisonBlock()      ← Format for AI               │
│  └── getStatLeader()              ← Find winner                 │
│                                                                   │
│  promptBuilder.ts (85 lines)                                     │
│  ├── buildSystemInstructions()    ← AI rules                    │
│  ├── buildAnalysisPrompt()        ← Full prompt                 │
│  ├── buildQBResponseFormat()      ← QB output format            │
│  └── buildSkillPositionResponseFormat() ← Other output          │
│                                                                   │
│  [tradeAnalysis.ts - TODO]                                       │
│  [dropAnalysis.ts - TODO]                                        │
│  [conversionHandler.ts - TODO]                                   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────┐
        │        Ollama AI (Local LLM)        │
        │     (Running on http://...:11434)   │
        └─────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────┐
        │       Client (React App, Curl)      │
        └─────────────────────────────────────┘
```

---

## Data Flow: "Should I start Jefferson or Chase?"

```
User Message
   │
   ▼
┌──────────────────────────────────────┐
│ POST /fantasy-chat                   │
│ { message: "Jefferson or Chase?" }   │
└──────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────┐
│ 1. EXTRACT PLAYERS (playerExtraction.ts)                     │
│ extractAllPlayers(message, playerStats)                      │
│                                                                │
│ Input:  "Jefferson or Chase?"                                │
│ Output: [                                                     │
│   { name: "Justin Jefferson", position: "WR" },             │
│   { name: "Ja'Marr Chase", position: "WR" }                 │
│ ]                                                             │
└──────────────────────────────────────────────────────────────┘
   │
   ├──────────────────────────────────────┐
   │                                      │
   ▼                                      ▼
┌────────────────────────┐      ┌────────────────────────┐
│ For Jefferson:         │      │ For Chase:             │
│                        │      │                        │
│ 1. getPlayerWeeks()    │      │ 1. getPlayerWeeks()    │
│    ↓                   │      │    ↓                   │
│    [                   │      │    [                   │
│     { week: 1, ...},   │      │     { week: 1, ...},   │
│     { week: 2, ...},   │      │     { week: 2, ...},   │
│     ...                │      │     ...                │
│    ]                   │      │    ]                   │
│                        │      │                        │
│ 2. getContextBuilder() │      │ 2. getContextBuilder() │
│    ↓                   │      │    ↓                   │
│    buildWRContext()    │      │    buildWRContext()    │
│                        │      │                        │
│ 3. builder(weeks)      │      │ 3. builder(weeks)      │
│    ↓                   │      │    ↓                   │
│    {                   │      │    {                   │
│     gamesPlayed: 14,   │      │     gamesPlayed: 13,   │
│     fantasyAvg: 18.5,  │      │     fantasyAvg: 19.2,  │
│     targets: 112,      │      │     targets: 98,       │
│     receptions: 87,    │      │     receptions: 76,    │
│     last3Summary: {    │      │     last3Summary: {    │
│       avgFantasyPts:   │      │       avgFantasyPts:   │
│       18.2,            │      │       20.1,            │
│       ...              │      │       ...              │
│     }                  │      │     }                  │
│    }                   │      │    }                   │
└────────────────────────┘      └────────────────────────┘
   │                                      │
   └──────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. BUILD ANALYSIS BLOCKS (playerAnalysis.ts)                 │
│                                                                │
│ buildWRAnalysisBlock("Jefferson", ctx, stats, week)         │
│    ▼                                                          │
│    "JUSTIN JEFFERSON (WR)                                   │
│     --- SEASON (Wk 1-16) ---                                │
│     Games Played: 14                                         │
│     Season Avg (PPR): 18.5                                  │
│     Total Rec Yds: 1683                                     │
│     Total TD: 8                                              │
│     ...                                                       │
│     --- LAST 3 WEEKS AVG (Weeks: 16, 15, 14) ---           │
│     Avg Fantasy Pts: 18.2                                   │
│     Avg Rec Yds: 104.3                                      │
│     ..."                                                      │
│                                                                │
│ buildWRAnalysisBlock("Chase", ctx, stats, week)            │
│    ▼                                                          │
│    "JA'MARR CHASE (WR)                                      │
│     ... [similar format]                                     │
│     Avg Fantasy Pts: 20.1                                   │
│     ..."                                                      │
└──────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. COMPARE PLAYERS (comparisonService.ts)                    │
│ comparePlayerStats(Jefferson, Chase, [                       │
│   { key: "avgFantasyPts", label: "Avg Fantasy Pts", ... },  │
│   { key: "avgReceivingYards", label: "Avg Rec Yds", ... },  │
│   { key: "consistencyScore", label: "Consistency", ... }    │
│ ])                                                            │
│    ▼                                                          │
│    [                                                          │
│     {                                                         │
│       statName: "Avg Fantasy Pts",                           │
│       leader: "Chase",                                       │
│       leaderValue: 20.1,                                     │
│       loserValue: 18.2                                       │
│     },                                                        │
│     {                                                         │
│       statName: "Avg Rec Yds",                               │
│       leader: "Jefferson",                                   │
│       leaderValue: 104.3,                                    │
│       loserValue: 98.7                                       │
│     },                                                        │
│     ...                                                       │
│    ]                                                          │
└──────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. FORMAT COMPARISON (comparisonService.ts)                  │
│ formatComparisonBlock(Jefferson, Chase, comparisons)         │
│    ▼                                                          │
│    "PRE-COMPUTED COMPARISONS (USE EXACTLY):                 │
│     • Avg Fantasy Pts: CHASE leads (20.1 vs 18.2)           │
│     • Avg Rec Yds: JEFFERSON leads (104.3 vs 98.7)         │
│     • Consistency: JEFFERSON leads (0.82 vs 0.78)"          │
└──────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. BUILD PROMPT (promptBuilder.ts)                           │
│ buildAnalysisPrompt({                                        │
│   playerData: "JUSTIN JEFFERSON...\nJA'MARR CHASE...",    │
│   comparisons: "PRE-COMPUTED...",                           │
│   userQuestion: "Should I start Jefferson or Chase?",       │
│   responseFormat: "▶ LAST 3 WEEKS STATS\n...",             │
│   positions: ["WR"]                                         │
│ })                                                            │
│    ▼                                                          │
│    Complete prompt with:                                     │
│    - System instructions (how to be precise)                │
│    - Player data (formatted stats)                          │
│    - Comparisons (pre-computed leaders)                     │
│    - User question                                          │
│    - Expected output format                                 │
└──────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────┐
│ 6. CALL OLLAMA                                               │
│ POST http://127.0.0.1:11434/api/generate                    │
│ {                                                            │
│   model: "mistral:latest",                                  │
│   prompt: "[complete prompt above]",                        │
│   stream: false,                                            │
│   temperature: 0.6                                          │
│ }                                                            │
│    ▼                                                          │
│    Response: "──────────────────────\n▶ LAST 3 WEEKS STATS  │
│    JUSTIN JEFFERSON\n- Avg Fantasy Pts: 18.2\n...           │
│    JA'MARR CHASE\n- Avg Fantasy Pts: 20.1\n...             │
│                                                              │
│    ──────────────────────\n▶ COMPARISON\n                   │
│    • Avg Fantasy Pts: CHASE leads (20.1 vs 18.2)\n          │
│    • Avg Rec Yds: JEFFERSON leads (104.3 vs 98.7)\n         │
│    - Summary: Chase has the edge in fantasy points...       │
│                                                              │
│    ──────────────────────\n▶ START/SIT DECISION\n          │
│    - START: CHASE\n- Confidence: 7/10\n- Reasoning: ...     │
│    "                                                         │
└──────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────┐
│ 7. RETURN TO CLIENT                                          │
│ { reply: "[AI response from step 6]" }                       │
└──────────────────────────────────────────────────────────────┘
```

---

## Component Interactions

```
User Query
   │
   ├─→ playerExtraction.extractAllPlayers()
   │   (finds QB, WR, TE, RB in message)
   │
   ├─→ contextBuilder.getContextBuilder(position)
   │   (routes to correct builder)
   │
   ├─→ buildXContext.ts (e.g., buildWRContext)
   │   ├─ Uses: statsFormatter.filterByWeeks()
   │   ├─ Uses: statsFormatter.sum()
   │   ├─ Uses: statsFormatter.calculateConsistency()
   │   └─ Uses: statsFormatter.getLastNWeeks()
   │
   ├─→ playerAnalysis.buildXAnalysisBlock()
   │   (formats stats for AI)
   │
   ├─→ comparisonService.comparePlayerStats()
   │   (if 2+ players of same position)
   │
   ├─→ comparisonService.formatComparisonBlock()
   │   (pre-computed comparisons for AI)
   │
   ├─→ promptBuilder.buildAnalysisPrompt()
   │   (constructs full prompt)
   │
   └─→ promptBuilder.buildQBResponseFormat()
       (or buildSkillPositionResponseFormat)
       
        ▼
   Send prompt to Ollama → Get response
```

---

## Adding a New Position

```
NEW POSITION INTEGRATION CHECKLIST

1. Create Context Builder
   └─→ utils/buildNEWContext.ts
       ├─ Import statsFormatter utilities
       ├─ Calculate position-specific stats
       └─ Return PlayerContext shape

2. Create Analysis Block Builder
   └─→ Add buildNEWAnalysisBlock() to playerAnalysis.ts
       └─ Format context for AI prompt

3. Update Context Factory
   └─→ contextBuilder.ts
       └─ Add NEW: buildNEWContext to builders map

4. Update Analysis Factory
   └─→ playerAnalysis.ts
       └─ Add NEW: buildNEWAnalysisBlock to builders map

5. (Optional) Define Comparison Stats
   └─→ In chatbotProxy.ts /fantasy-chat endpoint
       └─ Add stat configs for position comparison

RESULT: Position auto-detected and supported! ✅
```

---

## Feature Addition Pattern

```
NEW FEATURE (e.g., Trade Analysis)

1. Create New Service
   └─→ services/tradeAnalysis.ts
       ├─ analyzeTrade(give[], get[])
       ├─ calculateTradeValue()
       └─ formatTradeRecommendation()

2. Update Prompt Builder
   └─→ services/promptBuilder.ts
       └─ Add buildTradeResponseFormat()

3. Update Main Handler
   └─→ chatbotProxy.ts
       ├─ Detect "trade" keyword
       ├─ Parse "give X, get Y"
       └─ Call tradeAnalysis service

4. (Optional) Update Conversation Router
   └─→ services/conversationHandler.ts
       └─ Route: "should I trade" → tradeAnalysis
       └─ Route: "should I start" → comparisonService
       └─ Route: "should I drop" → dropAnalysis

RESULT: New feature integrated cleanly! ✅
```

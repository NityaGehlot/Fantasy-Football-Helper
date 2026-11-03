// app/services/appGuide.ts
// What each part of the app does and how to use it. Powers the help assistant (? in the top
// bar) and the first-run tutorial, so both always say the same thing.

export type GuideScreen = 'Home' | 'Fantasy' | 'Trades' | 'ChatBot';

export type GuideTopic = {
  id: string;
  title: string;
  keywords: string[];
  answer: string;
  screen?: GuideScreen;
  // Action button label when `screen` is set
  goLabel?: string;
};

export const GUIDE: GuideTopic[] = [
  {
    id: 'add-league',
    title: 'Add your Sleeper league',
    keywords: ['league', 'add', 'id', 'sleeper', 'connect', 'link', 'switch'],
    answer:
      'Tap your profile icon (top right) → Leagues, or tap the league name on the Fantasy tab. Paste your league ID or the league\'s sleeper.com link. To find it: on sleeper.com open your league; the long number after /leagues/ in the address is the ID. You can save several leagues and switch between them from the league name dropdown.',
    screen: 'Fantasy',
    goLabel: 'Open Fantasy',
  },
  {
    id: 'my-team',
    title: 'Set which team is yours',
    keywords: ['my team', 'set team', 'star', 'whose', 'which team', 'favorite team'],
    answer:
      'On the Fantasy tab, tap your team in the TEAM row, then "Make … my team". That unlocks lineup alerts, IR advice, notifications, the trade agent and AI answers about your roster. Do this once in each league.',
    screen: 'Fantasy',
    goLabel: 'Open Fantasy',
  },
  {
    id: 'win-odds',
    title: 'Live scores and win odds',
    keywords: ['win', 'odds', 'percent', 'projected', 'live', 'score', 'yet to play', 'proj'],
    answer:
      'During games the Fantasy tab shows a live scoreboard. "Proj" is points so far plus each starter\'s projection for the part of his game that\'s left. Win odds compare both projections and how much they can still swing; green is the favorite, red the underdog. Under each team you can see how many starters are yet to play and at which positions. It refreshes every minute.',
    screen: 'Fantasy',
    goLabel: 'See my matchup',
  },
  {
    id: 'lineup-alerts',
    title: 'Lineup alerts and lineup check',
    keywords: ['alert', 'bye', 'questionable', 'injured', 'inactive', 'lineup check', 'best lineup', 'swap'],
    answer:
      'The Fantasy tab warns you about starters who are out, on bye, doubtful or questionable, and empty spots. "Lineup check" compares your lineup with the best one for this week (adjusted for matchup, weather and injuries) and lists the swaps. With notifications on, you also get a lineup check 90 minutes before each kickoff, when inactive lists come out.',
    screen: 'Fantasy',
    goLabel: 'Open Fantasy',
  },
  {
    id: 'ir',
    title: 'Injured reserve (IR)',
    keywords: ['ir', 'injured reserve', 'reserve', 'locked', 'roster locked', 'activate'],
    answer:
      'If a player can go on IR, the Fantasy tab tells you to move him there (in Sleeper: tap the position button next to his name, then the IR spot) and suggests who to pick up with the open roster spot. If a player in your IR spot gets healthy, Sleeper locks your roster (no adds or moves) until he comes off IR; the app tells you who to drop to fix it.',
    screen: 'Fantasy',
    goLabel: 'Open Fantasy',
  },
  {
    id: 'start-sit',
    title: 'Who should I start?',
    keywords: ['start', 'sit', 'bench', 'compare', 'who should', 'flex', 'decide'],
    answer:
      'On the Assistant tab tap "Start or sit?", pick one of your players, then pick who could take his spot (only players who can play that spot are offered). The AI weighs recent form, the opponent\'s defense (vs the pass and run), weather, injuries on both teams and each player\'s weekly range, and explains every number. "Set my lineup" checks your whole lineup.',
    screen: 'ChatBot',
    goLabel: 'Open Assistant',
  },
  {
    id: 'ai-record',
    title: "The AI's track record",
    keywords: ['record', 'accuracy', 'right', 'wrong', 'track', 'trust'],
    answer:
      'Every start/sit call the AI makes is saved. After the games, the Assistant tab shows how often the player it picked actually scored more, so you can see how much to trust it.',
    screen: 'ChatBot',
    goLabel: 'Open Assistant',
  },
  {
    id: 'trades',
    title: 'Trade agent and grading offers',
    keywords: ['trade', 'offer', 'grade', 'untouchable', 'propose', 'fair'],
    answer:
      'The Trades tab scans your league every 6 hours for trades that improve your lineup without hurting the other team\'s. Lock players with "Untouchable players". "Grade a trade offer" lets you pick the players in any offer and see a grade, how both lineups change and the playoff schedules. "Propose in Sleeper" gives the steps and a message to send.',
    screen: 'Trades',
    goLabel: 'Open Trades',
  },
  {
    id: 'playoffs',
    title: 'Playoff schedule',
    keywords: ['playoff', 'week 15', 'week 16', 'week 17', 'schedule', 'sos', 'strength'],
    answer:
      'Trade and waiver advice look at each player\'s fantasy-playoff matchups (usually weeks 15-17): how many points those opponents allow to his position. Trade cards show "Playoffs: easy / average / tough schedule".',
    screen: 'Trades',
    goLabel: 'Open Trades',
  },
  {
    id: 'range',
    title: 'Weekly range (floor and ceiling)',
    keywords: ['range', 'floor', 'ceiling', 'boom', 'bust', 'safe', 'consistent'],
    answer:
      'Each player page shows a weekly range from his recent games: a bad week, a typical week and a good week, labeled safe, steady or boom/bust. Safe players are better when you\'re favored; boom/bust ones when you need a big week.',
    screen: 'Home',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    keywords: ['notification', 'bell', 'alert', 'push', 'touchdown', 'big play'],
    answer:
      'The bell (top right) collects alerts for every league where you set your team: lineup problems, injuries during games, touchdowns and big plays (green for yours, red for your opponent\'s), win-odds swings, IR moves, trade ideas, final scores and the lineup check. Each one shows when it happened and which league it\'s about, and most have "Ask AI what to do". Turn on pop-ups with the switch at the top of the list.',
  },
  {
    id: 'favorites',
    title: 'Favorite players and teams',
    keywords: ['favorite', 'follow', 'star', 'news', 'team news'],
    answer:
      'Tap ☆ Follow on any player page (or follow teams from "Your favorites" on Home). Home then shows the latest news about them.',
    screen: 'Home',
    goLabel: 'Open Home',
  },
  {
    id: 'news',
    title: 'News and trending players',
    keywords: ['news', 'trending', 'drops', 'adds', 'waiver', 'pickup', 'most dropped'],
    answer:
      'Home shows league headlines (filter by injuries, returns, trades and moves), the most added and dropped players on Sleeper, and an alert if one of your players is among the most dropped. "Who to drop?" asks the AI which of your players to cut for a trending pickup.',
    screen: 'Home',
    goLabel: 'Open Home',
  },
  {
    id: 'chat-storage',
    title: 'Chat history',
    keywords: ['chat', 'history', 'saved', 'clear', 'delete', 'storage'],
    answer:
      'Each league has its own conversation, saved on this device (the last 100 messages per league). Tap "Saving" to stop saving, or the trash icon to clear the chat for the league that\'s open.',
    screen: 'ChatBot',
  },
  {
    id: 'dark-mode',
    title: 'Light and dark mode',
    keywords: ['dark', 'light', 'theme', 'appearance', 'mode'],
    answer: 'Tap your profile icon (top right) → Appearance: Light, Dark, or Match device.',
  },
];

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1);

/** Best matching topics for a question (keyword + title overlap). */
export function matchGuide(question: string, limit = 3): GuideTopic[] {
  const q = ` ${question.toLowerCase()} `;
  const qWords = new Set(words(question));
  return GUIDE.map(t => {
    let score = 0;
    for (const k of t.keywords) if (q.includes(k.includes(' ') ? k : ` ${k}`)) score += k.includes(' ') ? 3 : 2;
    for (const w of words(t.title)) if (qWords.has(w)) score += 1;
    return { t, score };
  })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.t);
}

// The first-run tutorial: a short walk through the app.
export const TUTORIAL_STEPS: { icon: string; title: string; body: string; topic?: string }[] = [
  {
    icon: 'american-football',
    title: 'Welcome to Fantasy Football Helper',
    body: 'Your Sleeper league, with smarter advice: live win odds, lineup checks, injury and IR help, a trade agent and an AI assistant that explains its picks. Here is a quick tour.',
  },
  { icon: 'trophy', title: 'Add your league', body: GUIDE.find(g => g.id === 'add-league')!.answer, topic: 'add-league' },
  { icon: 'star', title: 'Pick your team', body: GUIDE.find(g => g.id === 'my-team')!.answer, topic: 'my-team' },
  { icon: 'stats-chart', title: 'Fantasy tab: live scores and alerts', body: `${GUIDE.find(g => g.id === 'win-odds')!.answer} ${GUIDE.find(g => g.id === 'lineup-alerts')!.answer}` },
  { icon: 'sparkles', title: 'Assistant: start/sit and more', body: GUIDE.find(g => g.id === 'start-sit')!.answer },
  { icon: 'swap-horizontal', title: 'Trades', body: GUIDE.find(g => g.id === 'trades')!.answer },
  { icon: 'notifications', title: 'Notifications', body: GUIDE.find(g => g.id === 'notifications')!.answer },
  {
    icon: 'help-circle',
    title: "You're ready",
    body: 'Tap the ? in the top bar any time to ask how something works, or to replay this tour. Start by adding your league.',
  },
];

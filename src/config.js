// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG = {
  gnewsApiKey: '', // set in Settings
  productHuntToken: '',
  sources: {
    hackernews:  { enabled: false, count: 3 },
    lobsters:    { enabled: true,  count: 5 },
    reddit:      { enabled: false, count: 3, subs: ['r/programming', 'r/technology'] },
    lemmy:       { enabled: true,  count: 5, instance: 'https://lemmy.world' },
    gnews:       { enabled: true,  count: 5 },
    devto:       { enabled: true,  count: 5 },
    producthunt: { enabled: false, count: 3 },
    techcrunch:  { enabled: true,  count: 4 },
    theverge:    { enabled: true,  count: 4 },
    arstechnica: { enabled: false, count: 4 },
    engadget:    { enabled: false, count: 4 },
    hackernoon:  { enabled: false, count: 4 },
    venturebeat: { enabled: false, count: 4 },
    rss:         { enabled: false, count: 4, feeds: [] }
  },
  cacheDurationMs: 60 * 60 * 1000
};

// Built-in RSS sources (fetched via rss2json — no per-host permission needed).
export const BUILTIN_RSS = {
  techcrunch:  { name: 'TechCrunch',   url: 'https://techcrunch.com/feed/' },
  theverge:    { name: 'The Verge',    url: 'https://www.theverge.com/rss/index.xml' },
  arstechnica: { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  engadget:    { name: 'Engadget',     url: 'https://www.engadget.com/rss.xml' },
  hackernoon:  { name: 'HackerNoon',   url: 'https://hackernoon.com/feed' },
  venturebeat: { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/' }
};

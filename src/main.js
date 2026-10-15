import { getArt } from './art.js';
import { resetGreeting, setLocationTz, updateTime } from './clock.js';
import { CONFIG } from './config.js';
import { DEFAULT_MARKETS, renderTicker } from './markets.js';
import { syncNewsHeight, updateNews } from './news.js';
import { initNotes } from './notes.js';
import { getFunFact, getQuote } from './quotes.js';
import { loadSettings } from './settings.js';
import { loadLinks } from './shortcuts.js';
import { localGet, localSet, localStore, syncGet, syncSet, syncStore } from './storage.js';
import { loadTodos } from './tasks.js';
import { loadTheme } from './theme.js';
import { debounce } from './util.js';
import { getWeather } from './weather.js';

// Modules that only wire up their own UI when loaded.
import './modals.js';
import './monitors.js';
import './search.js';
import './settings-panel.js';
import './tabsets.js';

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// FIRST-RUN SEED  (personalized defaults; runs once)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TODOS = [
  { text: 'Set your name, location, and API keys in Settings ⚙', done: false },
  { text: 'Pick your feed sources (Sources on the Feeds card)', done: false },
  { text: 'Save a tab set for your morning routine', done: false }
];
const DEFAULT_LINKS = [
  { name: 'GitHub',      url: 'https://github.com' },
  { name: 'Hacker News', url: 'https://news.ycombinator.com' },
  { name: 'MDN',         url: 'https://developer.mozilla.org' },
  { name: 'Claude',      url: 'https://claude.ai' }
];
async function seedDefaults() {
  const d = await syncGet('seeded');
  if (d.seeded) return;
  const cur = await localGet(['todos', 'links']);
  const patch = {};
  if (!(cur.todos && cur.todos.length)) patch.todos = DEFAULT_TODOS;
  if (!(cur.links && cur.links.length)) patch.links = DEFAULT_LINKS;
  await localSet(patch);
  await syncSet({ seeded: true });
}

// Tasks and shortcuts used to live in sync storage, which caps each item at 8 KB, so long
// lists stopped saving. Move them to local storage once.
async function migrateListsToLocal() {
  const [s, l] = await Promise.all([syncGet(['todos', 'links']), localGet(['todos', 'links'])]);
  const patch = {};
  if (s.todos && !l.todos) patch.todos = s.todos;
  if (s.links && !l.links) patch.links = s.links;
  if (Object.keys(patch).length) await localSet(patch);
  if (s.todos || s.links) await syncStore.remove(['todos', 'links']);
  // Drop the per-config news caches older versions left behind.
  const stale = Object.keys(await localStore.getAll()).filter(k => /^news(Time)?_/.test(k));
  if (stale.length) await localStore.remove(stale);
}

// One-time: union the expanded default watchlist into any existing one.
async function seedMarkets() {
  const d = await localGet(['marketSymbols', 'marketsSeedV2']);
  if (d.marketsSeedV2) return;
  const cur = d.marketSymbols ?? [];
  const merged = [...new Set([...cur, ...DEFAULT_MARKETS])];
  await localSet({ marketSymbols: merged, marketsSeedV2: true });
}

async function init() {
  loadTheme();
  const tzd = await localGet('locationTz');
  if (typeof tzd.locationTz === 'number') setLocationTz(tzd.locationTz);
  else updateTime();
  setInterval(updateTime, 1000);

  await loadSettings();
  resetGreeting(); // re-pick the greeting with the saved name
  await migrateListsToLocal();
  await seedDefaults();
  await seedMarkets();

  const saved = await syncGet('userConfig');
  if (saved?.userConfig) {
    const sc = saved.userConfig.sources ?? {};
    Object.keys(CONFIG.sources).forEach(k => { if (sc[k]) Object.assign(CONFIG.sources[k], sc[k]); });
  } else {
    await syncSet({ userConfig: { sources: CONFIG.sources } });
  }

  await Promise.allSettled([
    getWeather(), getQuote(), getFunFact(),
    loadTodos(), loadLinks(), initNotes(),
    getArt(), updateNews(false), renderTicker()
  ]);
  setInterval(renderTicker, 5 * 60 * 1000);

  // keep the news column the height of the stacked sidebar
  syncNewsHeight();
  const sb = document.querySelector('.sidebar');
  if (sb && 'ResizeObserver' in window) new ResizeObserver(debounce(syncNewsHeight, 120)).observe(sb);
  window.addEventListener('resize', debounce(syncNewsHeight, 150));
}

init();

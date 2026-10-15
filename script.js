'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
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
const BUILTIN_RSS = {
  techcrunch:  { name: 'TechCrunch',   url: 'https://techcrunch.com/feed/' },
  theverge:    { name: 'The Verge',    url: 'https://www.theverge.com/rss/index.xml' },
  arstechnica: { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  engadget:    { name: 'Engadget',     url: 'https://www.engadget.com/rss.xml' },
  hackernoon:  { name: 'HackerNoon',   url: 'https://hackernoon.com/feed' },
  venturebeat: { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/' }
};

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE  (sync for small synced prefs, local for bulky / sensitive data)
// ─────────────────────────────────────────────────────────────────────────────

function mkStore(area) {
  const chromeArea = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage[area]) ? chrome.storage[area] : null;
  if (chromeArea) {
    return {
      get: keys => new Promise(res => chromeArea.get(keys, res)),
      // Reject on quota or other errors so callers don't lose writes silently.
      set: obj  => new Promise((res, rej) => chromeArea.set(obj, () => {
        const err = chrome.runtime.lastError;
        if (err) { console.error(`Crowsnest: ${area} storage write failed`, err.message); rej(new Error(err.message)); }
        else res();
      })),
      remove: keys => new Promise(res => chromeArea.remove(keys, () => res())),
      getAll: () => new Promise(res => chromeArea.get(null, res))
    };
  }
  const prefix = `crowsnest:${area}:`;
  return {
    get: keys => new Promise(res => {
      const arr = Array.isArray(keys) ? keys : [keys];
      const out = {};
      arr.forEach(k => { const v = localStorage.getItem(prefix + k); out[k] = v == null ? undefined : JSON.parse(v); });
      res(out);
    }),
    set: obj => new Promise((res, rej) => {
      try { Object.entries(obj).forEach(([k, v]) => localStorage.setItem(prefix + k, JSON.stringify(v))); res(); }
      catch (e) { rej(e); }
    }),
    remove: keys => new Promise(res => {
      (Array.isArray(keys) ? keys : [keys]).forEach(k => localStorage.removeItem(prefix + k));
      res();
    }),
    getAll: () => new Promise(res => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) { try { out[k.slice(prefix.length)] = JSON.parse(localStorage.getItem(k)); } catch {} }
      }
      res(out);
    })
  };
}

const syncStore  = mkStore('sync');
const localStore = mkStore('local');

const syncGet  = k => syncStore.get(k);
const syncSet  = o => syncStore.set(o);
const localGet = k => localStore.get(k);
const localSet = o => localStore.set(o);

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function esc(str = '') {
  return String(str).replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function debounce(fn, ms) {
  let t = null;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// Minimal, safe Markdown -> HTML (escapes first, then applies limited formatting).
function mdToHtml(md = '') {
  const inline = s => s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      (m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  const lines = esc(md).split('\n');
  let html = '', list = null, m;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    if ((m = line.match(/^#{1,6}\s+(.*)$/)))      { closeList(); html += `<h4>${inline(m[1])}</h4>`; }
    else if ((m = line.match(/^[-*•]\s+(.*)$/)))  { if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = line.match(/^\d+[.)]\s+(.*)$/))){ if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else { closeList(); html += `<p>${inline(line)}</p>`; }
  }
  closeList();
  return html;
}

async function safeFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

function makeItem({ title, url, timestamp, source, excerpt, image, extraUrl } = {}) {
  return {
    title:     title || '(no title)',
    url:       url || '#',
    timestamp: timestamp ? Number(timestamp) : Date.now(),
    source:    source || 'unknown',
    excerpt:   excerpt || '',
    image:     image || null,
    extraUrl:  extraUrl || null
  };
}

function openUrl(url) {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
  else window.open(url, '_blank', 'noopener');
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS (Anthropic key/model, gnews key) — local store
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = { userName: '', anthropicKey: '', anthropicModel: 'claude-haiku-4-5-20251001', gnewsKey: '', accent: 'blue', artAutoOpen: false };
let SETTINGS = { ...DEFAULT_SETTINGS };

function applyAccent(accent) {
  document.body.classList.toggle('accent-green', accent === 'green');
}

async function loadSettings() {
  const d = await localGet('settings');
  SETTINGS = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  // Migrate retired model aliases to the current default.
  if (!SETTINGS.anthropicModel || /^claude-3-5-haiku/.test(SETTINGS.anthropicModel)) {
    SETTINGS.anthropicModel = DEFAULT_SETTINGS.anthropicModel;
  }
  if (SETTINGS.gnewsKey) CONFIG.gnewsApiKey = SETTINGS.gnewsKey;
  applyAccent(SETTINGS.accent);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE (Anthropic Messages API, direct browser access)
// ─────────────────────────────────────────────────────────────────────────────

async function callClaude(prompt, { system, maxTokens = 500 } = {}) {
  if (!SETTINGS.anthropicKey) {
    throw new Error('No Anthropic key set — add one via the gear (Settings).');
  }
  const body = {
    model: SETTINGS.anthropicModel || 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }]
  };
  if (system) body.system = system;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': SETTINGS.anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const e = await res.json(); msg = e?.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  return (data.content || []).map(b => b.text || '').join('').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────────────────────────────────────

const modeToggleBtn = document.getElementById('mode-toggle');
const themeIconPath = document.getElementById('theme-icon-path');
const ICON_MOON = 'M21 12.79A9 9 0 0 1 11.21 3 7 7 0 1 0 21 12.79z';
const ICON_SUN  = 'M12 7a5 5 0 1 0 0 10A5 5 0 0 0 12 7zm0-5a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1zm0 18a1 1 0 0 1-1-1v-1a1 1 0 0 1 2 0v1a1 1 0 0 1-1 1zM4.22 5.64a1 1 0 0 1 1.42-1.42l.7.71a1 1 0 0 1-1.41 1.41l-.71-.7zm13.02 12.02a1 1 0 1 1 1.42-1.42l.7.71a1 1 0 1 1-1.41 1.42l-.71-.71zM3 12a1 1 0 0 1 1-1h1a1 1 0 0 1 0 2H4a1 1 0 0 1-1-1zm16 0a1 1 0 0 1 1-1h1a1 1 0 0 1 0 2h-1a1 1 0 0 1-1-1zM4.22 18.36l.71-.7a1 1 0 0 1 1.41 1.41l-.71.71a1 1 0 0 1-1.41-1.42zm13.02-12.02l.71-.71a1 1 0 1 1 1.42 1.41l-.71.71a1 1 0 0 1-1.42-1.41z';

function applyTheme(theme) {
  document.body.classList.toggle('theme-light', theme === 'light');
  document.body.classList.toggle('theme-dark',  theme !== 'light');
  themeIconPath.setAttribute('d', theme === 'light' ? ICON_SUN : ICON_MOON);
  modeToggleBtn.setAttribute('aria-pressed', theme === 'light');
}
function loadTheme() { syncGet('uiTheme').then(d => applyTheme(d?.uiTheme ?? 'dark')); }
modeToggleBtn.addEventListener('click', () => {
  syncGet('uiTheme').then(d => {
    const next = (d?.uiTheme ?? 'dark') === 'light' ? 'dark' : 'light';
    syncSet({ uiTheme: next }).then(() => applyTheme(next));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TIME & GREETING
// ─────────────────────────────────────────────────────────────────────────────

// Name used in greetings; set in Settings. Falls back to a generic handle.
const greetingName = () => (SETTINGS.userName || '').trim() || 'operator';

const GREETINGS_BY_PART = {
  latenight: [ // 0–4
    'Midnight ops underway, {name}', 'The grid never sleeps, {name}', '0300 and still shipping, {name}',
    'Markets are closed — go to bed, {name}', 'Insomnia-driven development, {name}', 'Night shift on the terminal, {name}',
    'Burning the midnight compiler, {name}', 'Stealth mode engaged, {name}', 'Dark mode for a dark hour, {name}',
    'Even the bots are asleep, {name}', 'Allons-y into the small hours, {name}', 'Three commits past midnight, {name}'
  ],
  morning: [ // 5–10
    'Coffee first, conquer second, {name}', 'Rise and grind, {name}', 'Hello, world, {name}',
    'The bell rings at 9:30, {name}', 'First commit loading, {name}', 'Caffeine levels: critical, {name}',
    'Boot sequence complete, {name}', 'CI check, {name}', 'Good morning, operator {name}',
    'Sunrise over the skyline, {name}', 'Inbox zero is a myth, {name}', 'Today we ship, {name}', 'Stand-up in five, {name}'
  ],
  midday: [ // 11–13
    "Lunch can wait, the build can't, {name}", 'Halfway to victory, {name}', 'Midday momentum, {name}',
    'Refill that coffee, {name}', 'Markets at midday, {name}', 'Crush the afternoon block, {name}',
    "PRs won't review themselves, {name}", 'High noon on the terminal, {name}', 'Stardate: noon, {name}'
  ],
  afternoon: [ // 14–17
    'Merge window approaches, {name}', 'Power hour, {name}', 'Push the branch, {name}',
    'Afternoon flow state, {name}', 'Ship it before five, {name}', "Tests won't write themselves, {name}",
    'Second wind incoming, {name}', 'The grind respects you, {name}', 'Coffee refill advised, {name}'
  ],
  evening: [ // 18–21
    'Engage evening mode, {name}', "Side-project o'clock, {name}", 'Victory lap, {name}',
    'Markets closed, code open, {name}', 'Wind down or level up, {name}', 'Golden hour, {name}',
    'Shadows grow long, {name}', 'Ship the personal repo, {name}', 'Nightfall protocols arming, {name}'
  ],
  night: [ // 22–23
    'End-of-day report: epic, {name}', 'Nightfall protocols active, {name}', 'Log off or log in deeper, {name}',
    'One more deploy, {name}', "Tomorrow's edge starts tonight, {name}", 'Wrap the sprint, {name}', 'The Tardis is parked, {name}'
  ]
};

const GREETINGS_ANY = [
  'All circuits green, {name}', 'Welcome back to the grid, {name}', 'Jack in, {name}', 'The Matrix has you, {name}',
  'Level up: real-life edition, {name}', 'Compiling greatness, {name}', 'Neural net online, {name}', 'Sensors active, {name}',
  'Data flux stable, {name}', 'Allons-y, {name}', 'Ops status: nominal, {name}', 'Hack the planet, {name}',
  'Ghost in the machine, {name}', 'Root access granted, {name}', "Let's build something, {name}", 'Buy low, ship high, {name}',
  'Think more, code more, {name}', 'The game is afoot, {name}', 'Focus mode engaged, {name}', 'Brain repos syncing, {name}',
  'Claude is standing by, {name}', 'Reality is the best UI, {name}', 'Make it work, then make it legendary, {name}', 'Stardate now, {name}'
];

function partOfDay(h) {
  if (h < 5) return 'latenight';
  if (h < 11) return 'morning';
  if (h < 14) return 'midday';
  if (h < 18) return 'afternoon';
  if (h < 22) return 'evening';
  return 'night';
}
function pickGreeting(h) {
  const pool = [...GREETINGS_BY_PART[partOfDay(h)], ...GREETINGS_ANY];
  const tpl = pool[Math.floor(Math.random() * pool.length)];
  const name = greetingName();
  return tpl.replace(/\{name\}/g, name);
}
let _greeting = '', _greetingPart = '';
function refreshGreeting(h) {
  const part = partOfDay(h);
  if (part !== _greetingPart) { _greetingPart = part; _greeting = pickGreeting(h); }
  greetingEl.textContent = _greeting;
}
const timeEl = document.getElementById('time');
const greetingEl = document.getElementById('greeting');

// utc offset (seconds) of the saved location; null => use the machine's local time
let LOCATION_TZ = null;
function locationNow() {
  if (LOCATION_TZ == null) return new Date();
  const utcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
  return new Date(utcMs + LOCATION_TZ * 1000);
}
function updateTime() {
  const now = locationNow();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  timeEl.textContent = `${hh}:${mm}:${ss}`;
  refreshGreeting(now.getHours());
}

// ─────────────────────────────────────────────────────────────────────────────
// WEATHER  (ZIP via zippopotam.us, city via open-meteo geocoding)
// ─────────────────────────────────────────────────────────────────────────────

const WEATHER_DESC = {
  0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',45:'Foggy',48:'Icy fog',
  51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',56:'Freezing drizzle',57:'Heavy freezing drizzle',
  61:'Light rain',63:'Rain',65:'Heavy rain',66:'Freezing rain',67:'Heavy freezing rain',
  71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',80:'Rain showers',81:'Rain showers',
  82:'Violent rain',85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorm',96:'Thunderstorm + hail',99:'Thunderstorm + heavy hail'
};
const WEATHER_CACHE_KEY = 'cachedWeather';
const WEATHER_CACHE_TIME_KEY = 'cachedWeatherTime';
const WEATHER_CACHE_DURATION = 2 * 60 * 60 * 1000;

const weatherEl = document.getElementById('weather');
const toggleZipBtn = document.getElementById('toggle-zip');
const zipRowEl = document.getElementById('zip-row');
const zipInputEl = document.getElementById('zip-input');
const setZipBtn = document.getElementById('set-zip');
const cToF = c => Math.round(c * 9 / 5 + 32);

async function fetchAndRenderWeather(lat, lon, city = '') {
  weatherEl.textContent = 'fetching…';
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`;
    const data = await safeFetch(url);
    if (!data.current_weather) throw new Error('bad weather response');
    const { temperature: tempC, weathercode: code } = data.current_weather;
    const desc = WEATHER_DESC[code] ?? 'Unknown';
    const label = `${city ? city + ' · ' : ''}${cToF(tempC)}°F · ${desc}`;
    weatherEl.textContent = label;
    // capture the location's timezone so the clock + greeting reflect it
    const off = data.utc_offset_seconds;
    if (typeof off === 'number') { LOCATION_TZ = off; await localSet({ locationTz: off }); updateTime(); }
    await localSet({ [WEATHER_CACHE_KEY]: { text: label, lat, lon, city, tz: off }, [WEATHER_CACHE_TIME_KEY]: Date.now() });
  } catch {
    weatherEl.textContent = 'weather unavailable';
  }
}

async function geocodeQuery(qRaw) {
  const q = qRaw.trim();
  if (/^\d{5}$/.test(q)) {
    const data = await safeFetch(`https://api.zippopotam.us/us/${q}`);
    const place = data.places?.[0];
    if (!place) throw new Error('ZIP not found');
    return { lat: +place.latitude, lon: +place.longitude, city: `${place['place name']}, ${place['state abbreviation']}` };
  }
  const data = await safeFetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1`);
  const r = data.results?.[0];
  if (!r) throw new Error('location not found');
  return { lat: r.latitude, lon: r.longitude, city: `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}` };
}

async function setLocationFromQuery(q) {
  weatherEl.textContent = 'locating…';
  try {
    const loc = await geocodeQuery(q);
    await syncSet({ customLocation: loc });
    await fetchAndRenderWeather(loc.lat, loc.lon, loc.city);
  } catch (e) {
    weatherEl.textContent = e.message === 'location not found' || e.message === 'ZIP not found'
      ? `“${q}” not found` : 'lookup failed';
  }
}

async function getWeather() {
  const data = await localGet([WEATHER_CACHE_KEY, WEATHER_CACHE_TIME_KEY]);
  const synced = await syncGet('customLocation');
  const now = Date.now();
  if (data[WEATHER_CACHE_KEY] && now - (data[WEATHER_CACHE_TIME_KEY] ?? 0) < WEATHER_CACHE_DURATION) {
    weatherEl.textContent = data[WEATHER_CACHE_KEY].text;
    return;
  }
  const loc = synced?.customLocation || await browserLocation();
  if (!loc) { weatherEl.textContent = 'set your location ⌖'; return; }
  await fetchAndRenderWeather(loc.lat, loc.lon, loc.city ?? '');
}

// Ask the browser for a position when no location has been saved; null if denied.
function browserLocation() {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) }),
      () => res(null),
      { timeout: 8000, maximumAge: 60 * 60 * 1000 }
    );
  });
}

toggleZipBtn.addEventListener('click', () => {
  zipRowEl.classList.toggle('hidden');
  if (!zipRowEl.classList.contains('hidden')) zipInputEl.focus();
});
function submitZip() {
  const q = zipInputEl.value.trim();
  if (!q) return;
  setLocationFromQuery(q);
  zipInputEl.value = '';
  zipRowEl.classList.add('hidden');
}
setZipBtn.addEventListener('click', submitZip);
zipInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') submitZip(); });

// ─────────────────────────────────────────────────────────────────────────────
// QUOTE & FUN FACT
// ─────────────────────────────────────────────────────────────────────────────

const quoteEl = document.getElementById('quote');
const funFactEl = document.getElementById('fun-fact');
const LOCAL_QUOTES = [
  ["The best way to predict the future is to invent it.", "Alan Kay"],
  ["Talk is cheap. Show me the code.", "Linus Torvalds"],
  ["Premature optimization is the root of all evil.", "Donald Knuth"],
  ["First, solve the problem. Then, write the code.", "John Johnson"],
  ["Make it work, make it right, make it fast.", "Kent Beck"],
  ["Programs must be written for people to read.", "Harold Abelson"],
  ["Simplicity is the soul of efficiency.", "Austin Freeman"],
  ["Code is like humor. When you have to explain it, it's bad.", "Cory House"],
  ["Done is better than perfect.", "Sheryl Sandberg"],
  ["Stay hungry, stay foolish.", "Stewart Brand"],
  ["The obstacle is the way.", "Marcus Aurelius"],
  ["We suffer more in imagination than in reality.", "Seneca"],
  ["Luck is what happens when preparation meets opportunity.", "Seneca"],
  ["Discipline equals freedom.", "Jocko Willink"],
  ["Fortune favors the bold.", "Virgil"],
  ["You miss 100% of the shots you don't take.", "Wayne Gretzky"],
  ["Amateurs wait for inspiration; the rest of us get to work.", "Stephen King"],
  ["Well done is better than well said.", "Benjamin Franklin"],
  ["Quality is not an act, it is a habit.", "Aristotle"],
  ["Whether you think you can or you can't, you're right.", "Henry Ford"],
  ["In the middle of difficulty lies opportunity.", "Albert Einstein"],
  ["The market can stay irrational longer than you can stay solvent.", "John M. Keynes"],
  ["Risk comes from not knowing what you're doing.", "Warren Buffett"],
  ["Be fearful when others are greedy, and greedy when others are fearful.", "Warren Buffett"],
  ["Every battle is won before it is fought.", "Sun Tzu"],
  ["What gets measured gets managed.", "Peter Drucker"],
  ["The man who moves a mountain begins by carrying small stones.", "Confucius"],
  ["Action is the foundational key to all success.", "Pablo Picasso"]
];

async function getQuote() {
  const [lq, la] = LOCAL_QUOTES[Math.floor(Math.random() * LOCAL_QUOTES.length)];
  quoteEl.textContent = `"${lq}" — ${la}`;   // always show something
  try {
    const [item] = await safeFetch('https://zenquotes.io/api/random');
    if (item?.q && item.q.length < 240 && !/too many requests/i.test(item.q)) {
      quoteEl.textContent = `"${item.q}" — ${item.a}`;
    }
  } catch { /* keep the local quote */ }
}
async function getFunFact() {
  try { const data = await safeFetch('https://uselessfacts.jsph.pl/random.json?language=en');
    funFactEl.textContent = data?.text ?? ''; } catch { funFactEl.textContent = ''; }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH — modes incl. AI "ask"
// ─────────────────────────────────────────────────────────────────────────────

const SEARCH_ROUTES = {
  search:   q => `https://search.brave.com/search?q=${encodeURIComponent(q)}`,
  dev:      q => `https://github.com/search?q=${encodeURIComponent(q)}&type=repositories`,
  chat:     q => `https://claude.ai/new?q=${encodeURIComponent(q)}`,
  research: q => `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}`
};
const PLACEHOLDERS = {
  search: 'type a query…', dev: 'search repositories…', chat: 'start a chat…',
  research: 'research a topic…', ask: 'ask claude anything…'
};
let currentMode = 'search';
const searchEl = document.getElementById('search');
const searchSpinner = document.getElementById('search-spinner');
const askAnswerEl = document.getElementById('ask-answer');

document.getElementById('mode-chips').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  currentMode = chip.dataset.mode;
  searchEl.placeholder = PLACEHOLDERS[currentMode] || 'type a query…';
  askAnswerEl.classList.toggle('hidden', currentMode !== 'ask' || !askAnswerEl.textContent);
  searchEl.focus();
});

async function runAsk(q) {
  askAnswerEl.classList.remove('hidden');
  askAnswerEl.innerHTML = '<span class="ask-loading">querying claude…</span>';
  searchSpinner.classList.remove('hidden');
  try {
    const answer = await callClaude(q, {
      system: 'You are a concise assistant embedded in a browser new-tab page. Answer directly in 1-4 short paragraphs.',
      maxTokens: 700
    });
    askAnswerEl.innerHTML = answer ? mdToHtml(answer) : '(no answer)';
  } catch (e) {
    askAnswerEl.innerHTML = `<span class="ask-error">⚠ ${esc(e.message)}</span>`;
  } finally {
    searchSpinner.classList.add('hidden');
  }
}

searchEl.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim();
  if (!q) return;
  if (currentMode === 'ask') { runAsk(q); return; }
  window.location.href = (SEARCH_ROUTES[currentMode] ?? SEARCH_ROUTES.search)(q);
});

// ─────────────────────────────────────────────────────────────────────────────
// NEWS — fetchers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchHackerNews(count = 3) {
  if (!CONFIG.sources.hackernews.enabled) return [];
  try {
    const ids = await safeFetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    const out = [];
    for (const id of (Array.isArray(ids) ? ids : []).slice(0, count)) {
      try {
        const it = await safeFetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        if (it?.title) out.push(makeItem({
          title: it.title,
          url: `https://news.ycombinator.com/item?id=${id}`,   // open the HN discussion
          extraUrl: it.url ?? null,                            // article link (if any)
          timestamp: it.time ? it.time * 1000 : Date.now(), source: 'HN',
          excerpt: it.text ? it.text.replace(/<[^>]+>/g, '') : (it.url ? `${it.score ?? 0} points · ${it.descendants ?? 0} comments` : '')
        }));
      } catch {}
    }
    return out;
  } catch { return []; }
}

async function fetchLobsters(count = 5) {
  if (!CONFIG.sources.lobsters.enabled) return [];
  try {
    const data = await safeFetch('https://lobste.rs/hottest.json');
    return (Array.isArray(data) ? data : []).slice(0, count).map(p => makeItem({
      title: p.title, url: p.url || p.comments_url,
      timestamp: p.created_at ? new Date(p.created_at).getTime() : Date.now(),
      source: 'Lobsters', excerpt: (p.tags || []).join(', ')
    }));
  } catch { return []; }
}

async function fetchReddit(count = 3) {
  if (!CONFIG.sources.reddit.enabled) return [];
  const subs = [...new Set(CONFIG.sources.reddit.subs ?? [])];
  const all = [];
  for (const sub of subs) {
    try {
      const clean = sub.replace(/^\/+|\/+$/g, '');
      const data = await safeFetch(`https://old.reddit.com/${clean}.json?limit=${count}`, { headers: { Accept: 'application/json' } });
      (data?.data?.children ?? []).slice(0, count).forEach(c => {
        const d = c.data;
        all.push(makeItem({
          title: d.title, url: `https://old.reddit.com${d.permalink}`,
          timestamp: d.created_utc ? d.created_utc * 1000 : Date.now(),
          source: 'Reddit', excerpt: d.selftext ?? '',
          image: (d.thumbnail && /^https?:/.test(d.thumbnail)) ? d.thumbnail : null
        }));
      });
    } catch {}
  }
  return all;
}

async function fetchLemmy(count = 3) {
  if (!CONFIG.sources.lemmy.enabled) return [];
  try {
    const base = (CONFIG.sources.lemmy.instance ?? 'https://lemmy.world').replace(/\/$/, '');
    const data = await safeFetch(`${base}/api/v3/post/list?type=All&page=1&limit=${Math.max(count, 10)}&sort=Hot`);
    return (data?.posts ?? []).slice(0, count).map(p => {
      const post = p.post ?? p;
      return makeItem({
        title: post.name ?? post.title ?? '(lemmy)', url: post.url ?? `${base}/post/${post.id}`,
        timestamp: post.published ? new Date(post.published).getTime() : Date.now(),
        source: 'Lemmy', excerpt: post.body ?? '', image: post.thumbnail_url ?? null
      });
    });
  } catch { return []; }
}

async function fetchGNews(count = 3) {
  if (!CONFIG.sources.gnews.enabled) return [];
  const key = CONFIG.gnewsApiKey;
  if (!key) return [];
  try {
    const data = await safeFetch(`https://gnews.io/api/v4/top-headlines?token=${encodeURIComponent(key)}&lang=en&country=us&max=${count}`);
    return (data?.articles ?? []).slice(0, count).map(a => makeItem({
      title: a.title, url: a.url, timestamp: a.publishedAt ? new Date(a.publishedAt).getTime() : Date.now(),
      source: 'GNews', excerpt: a.description ?? a.content ?? '', image: a.image ?? null
    }));
  } catch { return []; }
}

async function fetchDevTo(count = 3) {
  if (!CONFIG.sources.devto.enabled) return [];
  try {
    const data = await safeFetch(`https://dev.to/api/articles?per_page=${count}`);
    return (data ?? []).slice(0, count).map(a => makeItem({
      title: a.title, url: a.url, timestamp: a.published_at ? new Date(a.published_at).getTime() : Date.now(),
      source: 'Dev', excerpt: a.description ?? '', image: a.cover_image ?? a.social_image ?? null
    }));
  } catch { return []; }
}

async function fetchProductHunt(count = 3) {
  if (!CONFIG.sources.producthunt.enabled) return [];
  try {
    const proxy = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://www.producthunt.com/feed')}`;
    const data = await safeFetch(proxy);
    return (data?.items ?? []).slice(0, count).map(it => makeItem({
      title: it.title, url: it.link, timestamp: it.pubDate ? new Date(it.pubDate).getTime() : Date.now(),
      source: 'PH', excerpt: it.contentSnippet ?? it.description ?? '', image: it.thumbnail || it.enclosure?.link || null
    }));
  } catch { return []; }
}

async function fetchRssFeed(url, source, count) {
  const data = await safeFetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`);
  const name = source || (data?.feed?.title ? data.feed.title.slice(0, 14) : 'RSS');
  return (data?.items ?? []).slice(0, count).map(it => makeItem({
    title: it.title, url: it.link, timestamp: it.pubDate ? new Date(it.pubDate).getTime() : Date.now(),
    source: name, excerpt: (it.description || it.content || '').replace(/<[^>]+>/g, '').slice(0, 240),
    image: it.thumbnail || it.enclosure?.link || null
  }));
}

async function fetchBuiltinRss() {
  const out = [];
  for (const [key, meta] of Object.entries(BUILTIN_RSS)) {
    const cfg = CONFIG.sources[key];
    if (!cfg?.enabled) continue;
    try { out.push(...await fetchRssFeed(meta.url, meta.name, cfg.count)); } catch {}
  }
  return out;
}

async function fetchRSS(count = 4) {
  if (!CONFIG.sources.rss.enabled) return [];
  const feeds = (CONFIG.sources.rss.feeds ?? []).filter(Boolean);
  const out = [];
  for (const feed of feeds) {
    try { out.push(...await fetchRssFeed(feed, null, count)); } catch {}
  }
  return out;
}

async function fetchAllNews() {
  const results = await Promise.all([
    fetchHackerNews(CONFIG.sources.hackernews.count),
    fetchLobsters(CONFIG.sources.lobsters.count),
    fetchReddit(CONFIG.sources.reddit.count),
    fetchLemmy(CONFIG.sources.lemmy.count),
    fetchGNews(CONFIG.sources.gnews.count),
    fetchDevTo(CONFIG.sources.devto.count),
    fetchProductHunt(CONFIG.sources.producthunt.count),
    fetchBuiltinRss(),
    fetchRSS(CONFIG.sources.rss.count)
  ]);
  const seen = new Set();
  return results.flat().filter(Boolean)
    .filter(it => { const k = it.url || it.title; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.timestamp - a.timestamp);
}

// ─────────────────────────────────────────────────────────────────────────────
// NEWS — cache + render (image cards, filter, sort, click→modal)
// ─────────────────────────────────────────────────────────────────────────────

const newsListEl = document.getElementById('news-list');
const newsStatusEl = document.getElementById('news-status');
const newsFilterEl = document.getElementById('news-filter');
const newsSortEl = document.getElementById('news-sort');
let ALL_NEWS = [];

function configKey() {
  return Object.keys(CONFIG.sources).sort()
    .map(k => `${k}:${CONFIG.sources[k].enabled}:${CONFIG.sources[k].count}`).join(',');
}
const SOURCE_CHIP_CLASS = {
  HN:'src-hn', Lobsters:'src-lobsters', Reddit:'src-reddit', Lemmy:'src-lemmy', GNews:'src-gnews',
  Dev:'src-devto', PH:'src-ph', 'TechCrunch':'src-tc', 'The Verge':'src-verge', 'Ars Technica':'src-ars',
  'Engadget':'src-engadget', 'HackerNoon':'src-hn2', 'VentureBeat AI':'src-vb'
};

function viewNews() {
  const term = (newsFilterEl.value || '').trim().toLowerCase();
  let items = ALL_NEWS.filter(it =>
    !term || it.title.toLowerCase().includes(term) || it.source.toLowerCase().includes(term) || (it.excerpt || '').toLowerCase().includes(term));
  const sort = newsSortEl.value;
  if (sort === 'newest') items.sort((a, b) => b.timestamp - a.timestamp);
  else if (sort === 'oldest') items.sort((a, b) => a.timestamp - b.timestamp);
  else if (sort === 'source') items.sort((a, b) => a.source.localeCompare(b.source) || b.timestamp - a.timestamp);
  renderNews(items.slice(0, 24));
}

function renderNews(items) {
  newsListEl.innerHTML = '';
  if (!items?.length) {
    const empty = document.createElement('div');
    empty.className = 'news-empty';
    empty.textContent = ALL_NEWS.length ? 'no matches.' : 'no feeds available.';
    newsListEl.appendChild(empty);
    return;
  }
  items.forEach((it, i) => {
    const card = document.createElement('article');
    card.className = 'nc' + (it.image ? '' : ' nc--noimg');
    card.style.animationDelay = `${i * 18}ms`;
    card.tabIndex = 0;

    if (it.image) {
      const media = document.createElement('div');
      media.className = 'nc-media';
      const img = document.createElement('img');
      img.loading = 'lazy'; img.alt = ''; img.src = it.image;
      img.onerror = () => { card.classList.add('nc--noimg'); media.remove(); };
      media.appendChild(img);
      card.appendChild(media);
    }

    const body = document.createElement('div');
    body.className = 'nc-body';

    const top = document.createElement('div');
    top.className = 'nc-top';
    const chip = document.createElement('span');
    chip.className = `source-chip ${SOURCE_CHIP_CLASS[it.source] ?? 'src-other'}`;
    chip.textContent = it.source;
    const time = document.createElement('span');
    time.className = 'nc-time';
    time.textContent = timeAgo(it.timestamp);
    top.appendChild(chip); top.appendChild(time);

    const title = document.createElement('div');
    title.className = 'nc-title';
    title.textContent = it.title;

    body.appendChild(top);
    body.appendChild(title);
    if (it.excerpt) {
      const ex = document.createElement('div');
      ex.className = 'nc-excerpt';
      ex.textContent = it.excerpt.replace(/\s+/g, ' ').slice(0, 160);
      body.appendChild(ex);
    }

    const ext = document.createElement('button');
    ext.className = 'nc-open';
    ext.title = 'Open original';
    ext.textContent = '↗';
    ext.addEventListener('click', e => { e.stopPropagation(); openUrl(it.url); });
    body.appendChild(ext);

    card.appendChild(body);
    card.addEventListener('click', () => openArticle(it));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') openArticle(it); });
    newsListEl.appendChild(card);
  });
}

async function updateNews(force = false) {
  const cacheKey = 'newsCache', cacheTimeKey = 'newsCacheTime', cacheCfgKey = 'newsCacheConfig';
  newsStatusEl.textContent = 'syncing…';
  const cached = await localGet([cacheKey, cacheTimeKey, cacheCfgKey]);
  const now = Date.now();
  const valid = cached[cacheKey] && cached[cacheCfgKey] === configKey() &&
    (now - (cached[cacheTimeKey] ?? 0)) < CONFIG.cacheDurationMs;

  if (!force && valid) {
    ALL_NEWS = cached[cacheKey];
    viewNews();
    newsStatusEl.textContent = new Date(cached[cacheTimeKey]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return;
  }
  try {
    const items = await fetchAllNews();
    const top = items.slice(0, 24);
    await localSet({ [cacheKey]: top, [cacheTimeKey]: now, [cacheCfgKey]: configKey() });
    ALL_NEWS = top;
    viewNews();
    newsStatusEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    newsStatusEl.textContent = 'sync failed';
    if (cached[cacheKey]) { ALL_NEWS = cached[cacheKey]; viewNews(); }
  }
}

document.getElementById('refresh-news').addEventListener('click', () => updateNews(true));
newsFilterEl.addEventListener('input', debounce(viewNews, 150));
newsSortEl.addEventListener('change', viewNews);

// Make the news list scroll within the height of the stacked sidebar.
function syncNewsHeight() {
  const sidebar = document.querySelector('.sidebar');
  const card = document.querySelector('.news-card');
  if (!sidebar || !card || !newsListEl) return;
  const chrome = card.getBoundingClientRect().height - newsListEl.getBoundingClientRect().height;
  const h = Math.max(220, sidebar.getBoundingClientRect().height - chrome);
  newsListEl.style.maxHeight = `${Math.round(h)}px`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ARTICLE MODAL  + AI summary
// ─────────────────────────────────────────────────────────────────────────────

const articleModal = document.getElementById('article-modal');
const articleTitleEl = document.getElementById('article-title');
const articleSourceEl = document.getElementById('article-source');
const articleLinkEl = document.getElementById('article-link');
const articleExtraEl = document.getElementById('article-extra');
const articleImgEl = document.getElementById('article-img');
const articleSummaryEl = document.getElementById('article-summary');

async function openArticle(it) {
  articleTitleEl.textContent = it.title;
  articleSourceEl.textContent = it.source;
  articleSourceEl.className = `source-chip ${SOURCE_CHIP_CLASS[it.source] ?? 'src-other'}`;
  articleLinkEl.href = it.url;
  articleLinkEl.textContent = it.source === 'HN' ? 'open discussion ↗' : 'open original ↗';
  // secondary link (e.g. HN article behind the discussion)
  if (it.extraUrl && it.extraUrl !== it.url) {
    articleExtraEl.href = it.extraUrl;
    articleExtraEl.classList.remove('hidden');
  } else {
    articleExtraEl.classList.add('hidden');
  }
  // image
  if (it.image) {
    articleImgEl.src = it.image;
    articleImgEl.classList.remove('hidden');
    articleImgEl.onerror = () => articleImgEl.classList.add('hidden');
  } else {
    articleImgEl.removeAttribute('src');
    articleImgEl.classList.add('hidden');
  }
  articleModal.classList.remove('hidden');

  if (!SETTINGS.anthropicKey) {
    articleSummaryEl.innerHTML = `<p class="muted">${it.excerpt ? esc(it.excerpt) : 'No preview available.'}</p>
      <p class="muted small">Add an Anthropic key in Settings ⚙ to get an AI summary here.</p>`;
    return;
  }
  articleSummaryEl.innerHTML = '<span class="ask-loading">summarizing…</span>';
  try {
    const prompt = `Summarize this article in 3 short bullet points, then one "why it matters" line. ` +
      `Base it on the title and excerpt; if thin, infer reasonably and note uncertainty.\n\n` +
      `Title: ${it.title}\nSource: ${it.source}\nURL: ${it.url}\nExcerpt: ${it.excerpt || '(none)'}`;
    const out = await callClaude(prompt, { maxTokens: 400 });
    articleSummaryEl.innerHTML = mdToHtml(out);
  } catch (e) {
    articleSummaryEl.innerHTML = `<span class="ask-error">⚠ ${esc(e.message)}</span>` +
      (it.excerpt ? `<p class="muted">${esc(it.excerpt)}</p>` : '');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LIGHTBOX
// ─────────────────────────────────────────────────────────────────────────────

const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const artModalTitle = document.getElementById('art-modal-title');
const artModalMeta = document.getElementById('art-modal-meta');
const artModalAbout = document.getElementById('art-modal-about');
const artModalLink = document.getElementById('art-modal-link');

function openArtModal(a) {
  lightboxImg.src = a.src;
  artModalTitle.textContent = a.title;
  artModalMeta.textContent = [a.artist, a.date, a.medium, a.museum].filter(Boolean).join(' · ');
  artModalAbout.textContent = a.blurb || '';
  artModalAbout.classList.toggle('hidden', !a.blurb);
  artModalLink.href = a.link;
  lightbox.classList.remove('hidden'); lightbox.setAttribute('aria-hidden', 'false');
}
function closeLightbox() {
  lightbox.classList.add('hidden'); lightbox.setAttribute('aria-hidden', 'true'); lightboxImg.src = '';
}
document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', e => { if (e.target.closest('.lightbox-info') || e.target === lightboxImg) return; closeLightbox(); });
document.getElementById('art-modal-ai').addEventListener('click', async () => {
  const a = CURRENT_ART; if (!a) return;
  artModalAbout.classList.remove('hidden');
  artModalAbout.innerHTML = '<span class="ask-loading">researching</span>';
  try {
    const out = await callClaude(
      `In 3-4 sentences, give an engaging note for someone viewing this artwork: "${a.title}" by ${a.artist}` +
      `${a.date ? ', ' + a.date : ''}${a.medium ? ', ' + a.medium : ''}, held at ${a.museum}. ` +
      `Say what it depicts and why it's notable. If you're unsure, say so briefly.`, { maxTokens: 280 });
    artModalAbout.innerHTML = mdToHtml(out);
  } catch (e) { artModalAbout.innerHTML = `<span class="ask-error">⚠ ${esc(e.message)}</span>`; }
});

// ─────────────────────────────────────────────────────────────────────────────
// MODAL helpers (generic open/close + Escape + scrim)
// ─────────────────────────────────────────────────────────────────────────────

function closeModalEl(el) { if (el) el.classList.add('hidden'); }
document.querySelectorAll('.modal-scrim[data-close]').forEach(s =>
  s.addEventListener('click', () => closeModalEl(s.closest('.modal'))));
// Every modal header close (×) button — covers article/config/settings/tabs/monitors.
document.querySelectorAll('.modal .modal-header .icon-btn').forEach(btn =>
  btn.addEventListener('click', () => closeModalEl(btn.closest('.modal'))));
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeLightbox();
  document.querySelectorAll('.modal:not(.hidden)').forEach(closeModalEl);
});

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG MODAL (feed sources)
// ─────────────────────────────────────────────────────────────────────────────

const configModal = document.getElementById('config-modal');
const cfgRedditSubs = document.getElementById('config-reddit-subs');
const cfgRss = document.getElementById('config-rss');

function openConfig() {
  Object.entries(CONFIG.sources).forEach(([key, v]) => {
    const cb = configModal.querySelector(`[data-source="${key}"]`);
    const inp = configModal.querySelector(`[data-count="${key}"]`);
    if (cb) cb.checked = v.enabled;
    if (inp) inp.value = v.count;
  });
  cfgRedditSubs.value = (CONFIG.sources.reddit.subs ?? []).join(', ');
  cfgRss.value = (CONFIG.sources.rss.feeds ?? []).join(', ');
  configModal.classList.remove('hidden');
}
function saveConfig() {
  configModal.querySelectorAll('[data-source]').forEach(cb => {
    const k = cb.dataset.source; if (CONFIG.sources[k]) CONFIG.sources[k].enabled = cb.checked;
  });
  configModal.querySelectorAll('[data-count]').forEach(inp => {
    const k = inp.dataset.count; if (CONFIG.sources[k]) CONFIG.sources[k].count = Math.min(15, Math.max(1, Number(inp.value) || 3));
  });
  CONFIG.sources.reddit.subs = cfgRedditSubs.value.split(',').map(s => s.trim()).filter(Boolean);
  CONFIG.sources.rss.feeds = cfgRss.value.split(',').map(s => s.trim()).filter(Boolean);
  if (CONFIG.sources.rss.feeds.length) CONFIG.sources.rss.enabled = true;
  syncSet({ userConfig: { sources: CONFIG.sources } }).then(() => {
    configModal.classList.add('hidden');
    updateNews(true);
  });
}
document.getElementById('config-open').addEventListener('click', openConfig);
document.getElementById('config-close').addEventListener('click', () => configModal.classList.add('hidden'));
document.getElementById('config-cancel').addEventListener('click', () => configModal.classList.add('hidden'));
document.getElementById('config-save').addEventListener('click', saveConfig);

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS MODAL
// ─────────────────────────────────────────────────────────────────────────────

const settingsModal = document.getElementById('settings-modal');
const setNameEl = document.getElementById('set-user-name');
const setKeyEl = document.getElementById('set-anthropic-key');
const setModelEl = document.getElementById('set-anthropic-model');
const setGnewsEl = document.getElementById('set-gnews-key');
const setAccentEl = document.getElementById('set-accent');
const setArtAutoEl = document.getElementById('set-art-auto');
const settingsStatus = document.getElementById('settings-status');

function openSettings() {
  setNameEl.value = SETTINGS.userName || '';
  setKeyEl.value = SETTINGS.anthropicKey || '';
  setModelEl.value = SETTINGS.anthropicModel || DEFAULT_SETTINGS.anthropicModel;
  setGnewsEl.value = SETTINGS.gnewsKey || '';
  setAccentEl.value = SETTINGS.accent || 'blue';
  setArtAutoEl.checked = !!SETTINGS.artAutoOpen;
  settingsStatus.classList.add('hidden');
  settingsModal.classList.remove('hidden');
}
async function saveSettings() {
  SETTINGS.userName = setNameEl.value.trim();
  SETTINGS.anthropicKey = setKeyEl.value.trim();
  SETTINGS.anthropicModel = setModelEl.value.trim() || DEFAULT_SETTINGS.anthropicModel;
  SETTINGS.gnewsKey = setGnewsEl.value.trim();
  SETTINGS.accent = setAccentEl.value;
  SETTINGS.artAutoOpen = setArtAutoEl.checked;
  if (SETTINGS.gnewsKey) CONFIG.gnewsApiKey = SETTINGS.gnewsKey;
  applyAccent(SETTINGS.accent);
  await localSet({ settings: SETTINGS });
  _greetingPart = ''; updateTime();
  settingsModal.classList.add('hidden');
}
// live accent preview while the dropdown changes
document.getElementById('set-accent').addEventListener('change', e => applyAccent(e.target.value));

// ── Backup: export / import all storage (incl. keys) ──
async function exportBackup() {
  const [sync, local] = await Promise.all([syncStore.getAll(), localStore.getAll()]);
  const backup = { app: 'crowsnest', version: 1, exportedAt: new Date().toISOString(), sync, local };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `crowsnest-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  settingsStatus.style.color = ''; settingsStatus.textContent = 'Backup downloaded.'; settingsStatus.classList.remove('hidden');
}
async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { settingsStatus.textContent = 'Invalid JSON file.'; settingsStatus.classList.remove('hidden'); return; }
  if (!data || (data.app && !['crowsnest', 'agora'].includes(data.app))) { settingsStatus.textContent = 'Not a Crowsnest backup.'; settingsStatus.classList.remove('hidden'); return; }
  // Older backups kept tasks and shortcuts in sync storage; those now live in local.
  const { todos, links, ...syncRest } = (data.sync && typeof data.sync === 'object') ? data.sync : {};
  const localData = { ...(todos && { todos }), ...(links && { links }), ...((data.local && typeof data.local === 'object') ? data.local : {}) };
  await syncSet(syncRest);
  await localSet(localData);
  settingsStatus.style.color = 'var(--primary)'; settingsStatus.textContent = 'Imported — reloading…'; settingsStatus.classList.remove('hidden');
  setTimeout(() => location.reload(), 700);
}
document.getElementById('export-backup').addEventListener('click', exportBackup);
document.getElementById('import-backup').addEventListener('click', () => document.getElementById('import-file').click());
document.getElementById('import-file').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) importBackup(f); e.target.value = ''; });
document.getElementById('open-settings').addEventListener('click', openSettings);
document.getElementById('settings-close').addEventListener('click', () => settingsModal.classList.add('hidden'));
document.getElementById('settings-cancel').addEventListener('click', () => settingsModal.classList.add('hidden'));
document.getElementById('settings-save').addEventListener('click', saveSettings);

// ─────────────────────────────────────────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────────────────────────────────────────

const todoListEl = document.getElementById('todo-list');
const todoInputEl = document.getElementById('todo-input');
function renderTodos(todos) {
  todoListEl.innerHTML = '';
  todos.forEach((todo, i) => {
    const li = document.createElement('li'); li.className = 'todo-item';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = todo.done;
    cb.addEventListener('change', () => toggleTodo(i));
    const span = document.createElement('span'); span.className = 'todo-text' + (todo.done ? ' done' : ''); span.textContent = todo.text;
    const del = document.createElement('button'); del.className = 'list-action'; del.title = 'Delete'; del.textContent = '×';
    del.addEventListener('click', () => deleteTodo(i));
    li.append(cb, span, del); todoListEl.appendChild(li);
  });
}
async function loadTodos() { const d = await localGet('todos'); renderTodos(d.todos ?? []); }
async function addTodo() {
  const text = todoInputEl.value.trim(); if (!text) return;
  const d = await localGet('todos'); const todos = [...(d.todos ?? []), { text, done: false }];
  await localSet({ todos }); renderTodos(todos); todoInputEl.value = '';
}
async function toggleTodo(index) {
  const d = await localGet('todos'); const todos = d.todos ?? [];
  if (!todos[index]) return; todos[index].done = !todos[index].done;
  await localSet({ todos }); renderTodos(todos);
}
async function deleteTodo(index) {
  const d = await localGet('todos'); const todos = (d.todos ?? []).filter((_, i) => i !== index);
  await localSet({ todos }); renderTodos(todos);
}
async function clearDoneTodos() {
  const d = await localGet('todos'); const todos = (d.todos ?? []).filter(t => !t.done);
  await localSet({ todos }); renderTodos(todos);
}
document.getElementById('add-todo').addEventListener('click', addTodo);
document.getElementById('clear-todo').addEventListener('click', clearDoneTodos);
todoInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });

// ─────────────────────────────────────────────────────────────────────────────
// SHORTCUTS
// ─────────────────────────────────────────────────────────────────────────────

const linkListEl = document.getElementById('link-list');
const linkNameEl = document.getElementById('link-name');
const linkUrlEl = document.getElementById('link-url');
const linkErrorEl = document.getElementById('link-error');
function faviconUrl(url) { try { return `${new URL(url).origin}/favicon.ico`; } catch { return ''; } }
function renderLinks(links) {
  linkListEl.innerHTML = '';
  (links ?? []).forEach((link, i) => {
    const li = document.createElement('li'); li.className = 'link-item';
    const img = document.createElement('img'); img.className = 'link-favicon'; img.src = faviconUrl(link.url); img.alt = '';
    img.onerror = () => { img.style.display = 'none'; };
    const a = document.createElement('a'); a.href = link.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = link.name;
    const del = document.createElement('button'); del.className = 'list-action'; del.title = 'Remove'; del.textContent = '×';
    del.addEventListener('click', () => deleteLink(i));
    li.append(img, a, del); linkListEl.appendChild(li);
  });
}
async function loadLinks() { const d = await localGet('links'); renderLinks(d.links ?? []); }
async function addLink() {
  const name = linkNameEl.value.trim(), url = linkUrlEl.value.trim();
  if (!name || !url) { showLinkError('Name and URL required.'); return; }
  if (!/^https?:\/\//i.test(url)) { showLinkError('URL must start with http:// or https://'); return; }
  linkErrorEl.classList.add('hidden');
  const d = await localGet('links'); const links = [...(d.links ?? []), { name, url }];
  await localSet({ links }); renderLinks(links); linkNameEl.value = ''; linkUrlEl.value = '';
}
async function deleteLink(index) {
  const d = await localGet('links'); const links = (d.links ?? []).filter((_, i) => i !== index);
  await localSet({ links }); renderLinks(links);
}
async function clearAllLinks() { await localSet({ links: [] }); renderLinks([]); }
function showLinkError(msg) { linkErrorEl.textContent = msg; linkErrorEl.classList.remove('hidden'); }
document.getElementById('add-link').addEventListener('click', addLink);
document.getElementById('clear-links').addEventListener('click', clearAllLinks);
linkUrlEl.addEventListener('keydown', e => { if (e.key === 'Enter') addLink(); });
linkNameEl.addEventListener('keydown', e => { if (e.key === 'Enter') linkUrlEl.focus(); });

// ─────────────────────────────────────────────────────────────────────────────
// NOTES (Quill)
// ─────────────────────────────────────────────────────────────────────────────

const notesStatus = document.getElementById('notes-status');
let quill = null;
async function initNotes() {
  if (typeof Quill === 'undefined') { notesStatus.textContent = 'editor unavailable'; return; }
  try {
    quill = new Quill('#notes-editor', {
      theme: 'snow',
      placeholder: 'scratchpad…',
      modules: { toolbar: [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['code-block', 'link'], ['clean']] }
    });
    const d = await localGet('notesHtml');
    if (d.notesHtml) quill.root.innerHTML = d.notesHtml;
    const save = debounce(async () => {
      await localSet({ notesHtml: quill.root.innerHTML });
      notesStatus.textContent = 'saved';
      setTimeout(() => { notesStatus.textContent = ''; }, 1200);
    }, 600);
    quill.on('text-change', () => { notesStatus.textContent = 'editing…'; save(); });
  } catch (e) {
    notesStatus.textContent = 'editor error';
    console.error('Notes init failed', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ART  (Cleveland · Art Institute of Chicago · Met)
// ─────────────────────────────────────────────────────────────────────────────

const artEl = document.getElementById('art-content');

async function artCleveland() {
  const data = await safeFetch('https://openaccess-api.clevelandart.org/api/artworks/?limit=50&has_image=1&public_domain=1');
  const pool = (data?.data ?? []).filter(a => a.images?.web?.url);
  if (!pool.length) throw new Error('no cleveland art');
  const p = pool[Math.floor(Math.random() * pool.length)];
  return {
    src: p.images.web.url, title: p.title ?? 'Untitled', artist: p.creators?.[0]?.description ?? 'Unknown',
    link: p.url ?? '#', museum: 'Cleveland Museum of Art', date: p.creation_date ?? '',
    medium: p.technique ?? p.type ?? '', blurb: (p.description || p.tombstone || '').replace(/<[^>]+>/g, '')
  };
}
async function artAIC() {
  const page = 1 + Math.floor(Math.random() * 50);
  const data = await safeFetch(`https://api.artic.edu/api/v1/artworks?fields=id,title,image_id,artist_title,date_display,medium_display,place_of_origin,thumbnail&limit=50&page=${page}`);
  const pool = (data?.data ?? []).filter(a => a.image_id);
  if (!pool.length) throw new Error('no aic art');
  const p = pool[Math.floor(Math.random() * pool.length)];
  return {
    src: `https://www.artic.edu/iiif/2/${p.image_id}/full/843,/0/default.jpg`,
    title: p.title ?? 'Untitled', artist: p.artist_title ?? 'Unknown',
    link: `https://www.artic.edu/artworks/${p.id}`, museum: 'Art Institute of Chicago',
    date: p.date_display ?? '', medium: p.medium_display ?? '', blurb: p.thumbnail?.alt_text ?? ''
  };
}
async function artMet() {
  const ids = await safeFetch('https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=painting');
  const list = ids?.objectIDs ?? [];
  if (!list.length) throw new Error('no met ids');
  for (let i = 0; i < 5; i++) {
    const id = list[Math.floor(Math.random() * list.length)];
    const o = await safeFetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
    if (o?.primaryImageSmall) return {
      src: o.primaryImageSmall, title: o.title ?? 'Untitled', artist: o.artistDisplayName || 'Unknown',
      link: o.objectURL ?? '#', museum: 'The Met', date: o.objectDate ?? '', medium: o.medium ?? '',
      blurb: [o.culture, o.department].filter(Boolean).join(' · ')
    };
  }
  throw new Error('no met image');
}

let CURRENT_ART = null;
async function getArt() {
  artEl.innerHTML = '<span class="art-loading">loading artwork…</span>';
  const sources = [artAIC, artCleveland, artMet].sort(() => Math.random() - 0.5);
  for (const src of sources) {
    try {
      const a = await src();
      CURRENT_ART = a;
      artEl.innerHTML = '';
      const img = document.createElement('img');
      img.className = 'art-thumb'; img.loading = 'lazy'; img.src = a.src; img.alt = a.title;
      img.addEventListener('click', () => openArtModal(a));
      const info = document.createElement('div'); info.className = 'art-info';
      const link = document.createElement('a'); link.className = 'art-title'; link.href = a.link;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = a.title;
      const meta = document.createElement('span'); meta.className = 'art-artist';
      meta.textContent = `${a.artist}${a.museum ? ' · ' + a.museum : ''}`;
      info.append(link, meta);
      artEl.append(img, info);
      if (SETTINGS.artAutoOpen) openArtModal(a);
      return;
    } catch (e) { /* try next source */ }
  }
  artEl.innerHTML = '<span class="art-loading">art unavailable</span>';
}
document.getElementById('art-random').addEventListener('click', getArt);

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT TABS (named sets)
// ─────────────────────────────────────────────────────────────────────────────

const tabsModal = document.getElementById('tabs-modal');
const tabsetsListEl = document.getElementById('tabsets-list');
const tabsetNameEl = document.getElementById('tabset-name');
const tabsetUrlsEl = document.getElementById('tabset-urls');

async function getTabSets() { const d = await localGet('tabSets'); return d.tabSets ?? []; }
async function saveTabSets(sets) { await localSet({ tabSets: sets }); }

function renderTabSets(sets) {
  tabsetsListEl.innerHTML = '';
  if (!sets.length) { tabsetsListEl.innerHTML = '<p class="muted small">No sets yet. Create one below.</p>'; return; }
  sets.forEach((set, i) => {
    const row = document.createElement('div'); row.className = 'tabset-row';
    const info = document.createElement('div'); info.className = 'tabset-info';
    const name = document.createElement('div'); name.className = 'tabset-title'; name.textContent = set.name;
    const meta = document.createElement('div'); meta.className = 'tabset-meta'; meta.textContent = `${set.urls.length} tab${set.urls.length === 1 ? '' : 's'}`;
    info.append(name, meta);
    const open = document.createElement('button'); open.className = 'btn-tonal btn-sm'; open.textContent = 'Open';
    open.addEventListener('click', () => set.urls.forEach(openUrl));
    const del = document.createElement('button'); del.className = 'list-action'; del.title = 'Delete'; del.textContent = '×';
    del.addEventListener('click', async () => { const s = await getTabSets(); s.splice(i, 1); await saveTabSets(s); renderTabSets(s); });
    row.append(info, open, del); tabsetsListEl.appendChild(row);
  });
}
async function openTabsModal() { renderTabSets(await getTabSets()); tabsModal.classList.remove('hidden'); }
async function addTabSet() {
  const name = tabsetNameEl.value.trim();
  const urls = tabsetUrlsEl.value.split('\n').map(u => u.trim()).filter(Boolean)
    .map(u => /^https?:\/\//i.test(u) ? u : `https://${u}`);
  if (!name || !urls.length) return;
  const sets = await getTabSets(); sets.push({ name, urls }); await saveTabSets(sets);
  renderTabSets(sets); tabsetNameEl.value = ''; tabsetUrlsEl.value = '';
}
document.getElementById('default-tabs').addEventListener('click', openTabsModal);
document.getElementById('tabs-close').addEventListener('click', () => tabsModal.classList.add('hidden'));
document.getElementById('tabset-add').addEventListener('click', addTabSet);

// ─────────────────────────────────────────────────────────────────────────────
// MONITORS — uptime + markets
// ─────────────────────────────────────────────────────────────────────────────

const monitorsModal = document.getElementById('monitors-modal');
const uptimeListEl = document.getElementById('uptime-list');
const uptimeUrlEl = document.getElementById('uptime-url');
const marketsListEl = document.getElementById('markets-list');
const marketSymbolEl = document.getElementById('market-symbol');

document.getElementById('server-status').addEventListener('click', async () => {
  monitorsModal.classList.remove('hidden');
  renderUptime(await getUptimeTargets());
  renderMarkets(await getMarketSymbols());
  checkAllUptime();
  refreshMarkets();
});
document.getElementById('monitors-close').addEventListener('click', () => monitorsModal.classList.add('hidden'));
document.getElementById('monitor-tabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn'); if (!btn) return;
  document.querySelectorAll('#monitor-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#monitors-modal .tab-panel').forEach(p =>
    p.classList.toggle('hidden', p.dataset.panel !== btn.dataset.tab));
});

// — uptime —
async function getUptimeTargets() { const d = await localGet('uptimeTargets'); return d.uptimeTargets ?? []; }
async function saveUptimeTargets(t) { await localSet({ uptimeTargets: t }); }
function renderUptime(targets) {
  uptimeListEl.innerHTML = '';
  if (!targets.length) { uptimeListEl.innerHTML = '<li class="muted small">No services watched yet.</li>'; return; }
  targets.forEach((url, i) => {
    const li = document.createElement('li'); li.className = 'monitor-item'; li.dataset.url = url;
    const dot = document.createElement('span'); dot.className = 'status-dot status-pending';
    const label = document.createElement('span'); label.className = 'monitor-label'; label.textContent = url.replace(/^https?:\/\//, '');
    const lat = document.createElement('span'); lat.className = 'monitor-latency'; lat.textContent = '…';
    const del = document.createElement('button'); del.className = 'list-action'; del.title = 'Remove'; del.textContent = '×';
    del.addEventListener('click', async () => { const t = await getUptimeTargets(); t.splice(i, 1); await saveUptimeTargets(t); renderUptime(t); });
    li.append(dot, label, lat, del); uptimeListEl.appendChild(li);
  });
}
// state: 'up' (2xx), 'down' (error status, timeout or no answer), or 'reachable' when the
// site answered but doesn't allow CORS, so the browser hides its status code.
async function checkUptime(url) {
  const start = performance.now();
  const elapsed = () => Math.round(performance.now() - start);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    return res.ok ? { state: 'up', ms: elapsed() } : { state: 'down', code: res.status };
  } catch {
    if (ctrl.signal.aborted) return { state: 'down' };
    try {
      await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
      return { state: 'reachable', ms: elapsed() };
    } catch { return { state: 'down' }; }
  } finally { clearTimeout(t); }
}
async function checkAllUptime() {
  const items = [...uptimeListEl.querySelectorAll('.monitor-item')];
  await Promise.all(items.map(async li => {
    const dot = li.querySelector('.status-dot'); const lat = li.querySelector('.monitor-latency');
    dot.className = 'status-dot status-pending'; lat.textContent = '…';
    const r = await checkUptime(li.dataset.url);
    dot.className = `status-dot status-${r.state}`;
    if (r.state === 'up') { lat.textContent = `${r.ms}ms`; li.title = 'Up'; }
    else if (r.state === 'reachable') { lat.textContent = `${r.ms}ms?`; li.title = "The site answered, but it blocks reading its status code (no CORS), so an error page can't be ruled out."; }
    else { lat.textContent = r.code ? `HTTP ${r.code}` : 'down'; li.title = r.code ? `Responded with HTTP ${r.code}` : 'No response'; }
  }));
}
async function addUptime() {
  let url = uptimeUrlEl.value.trim(); if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const t = await getUptimeTargets(); t.push(url); await saveUptimeTargets(t);
  renderUptime(t); uptimeUrlEl.value = ''; checkAllUptime();
}
document.getElementById('uptime-add').addEventListener('click', addUptime);
uptimeUrlEl.addEventListener('keydown', e => { if (e.key === 'Enter') addUptime(); });
document.getElementById('uptime-refresh').addEventListener('click', checkAllUptime);

// — markets —
const DEFAULT_MARKETS = [
  // crypto (CoinGecko ids)
  'bitcoin', 'ethereum', 'solana', 'dogecoin', 'ripple',
  // hot tech / AI stocks ($ = stooq)
  '$NVDA', '$MSFT', '$GOOGL', '$AMZN', '$META', '$AAPL', '$TSLA',
  '$AMD', '$AVGO', '$PLTR', '$TSM', '$ARM', '$MRVL', '$MU'
];
async function getMarketSymbols() { const d = await localGet('marketSymbols'); return d.marketSymbols ?? DEFAULT_MARKETS; }
async function saveMarketSymbols(s) { await localSet({ marketSymbols: s }); }
function renderMarkets(symbols) {
  marketsListEl.innerHTML = '';
  if (!symbols.length) { marketsListEl.innerHTML = '<li class="muted small">Nothing tracked.</li>'; return; }
  symbols.forEach((sym, i) => {
    const li = document.createElement('li'); li.className = 'monitor-item'; li.dataset.symbol = sym;
    const label = document.createElement('span'); label.className = 'monitor-label monitor-link'; label.textContent = sym;
    label.title = 'Details'; label.addEventListener('click', () => openMarketModal(sym));
    const price = document.createElement('span'); price.className = 'market-price'; price.textContent = '…';
    const chg = document.createElement('span'); chg.className = 'market-change'; chg.textContent = '';
    const edit = document.createElement('button'); edit.className = 'list-action'; edit.title = 'Edit symbol'; edit.textContent = '✎';
    edit.addEventListener('click', () => startEditMarket(li, i, sym));
    const del = document.createElement('button'); del.className = 'list-action'; del.title = 'Remove'; del.textContent = '×';
    del.addEventListener('click', async () => { const s = await getMarketSymbols(); s.splice(i, 1); await saveMarketSymbols(s); renderMarkets(s); refreshMarkets(); renderTicker(); });
    li.append(label, price, chg, edit, del); marketsListEl.appendChild(li);
  });
}
function startEditMarket(li, i, sym) {
  if (li.querySelector('.market-edit-input')) return;
  const label = li.querySelector('.monitor-label');
  const input = document.createElement('input');
  input.className = 'market-edit-input'; input.value = sym;
  input.placeholder = 'bitcoin or $NVDA';
  li.replaceChild(input, label);
  input.focus(); input.select();
  let cancelled = false, done = false;
  const finish = async () => {
    if (done) return; done = true;
    const val = input.value.trim();
    const s = await getMarketSymbols();
    if (!cancelled && val && val !== sym) s[i] = val;
    await saveMarketSymbols(s);
    renderMarkets(s); refreshMarkets(); renderTicker();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(); }
    else if (e.key === 'Escape') { e.stopPropagation(); cancelled = true; finish(); }
  });
  input.addEventListener('blur', finish);
}

// stooq.com CSV quote for a $TICKER (US tickers get a .us suffix). The change is measured
// against the previous close when stooq returns one, otherwise against today's open, and
// `basis` says which so the UI can label it.
function stooqTicker(sym) {
  let t = sym.replace(/^\$/, '').toLowerCase();
  if (!t.includes('.')) t += '.us';
  return t;
}
function parseStooqQuote(csv) {
  const [head = '', line = ''] = csv.trim().split(/\r?\n/);
  const cols = head.split(',').map(c => c.trim().toLowerCase());
  const cells = line.split(',');
  const nameAt = cols.indexOf('name');
  const cell = name => {
    const i = cols.findIndex(c => c === name || c.startsWith(name));
    if (i < 0) return undefined;
    return i === nameAt ? cells.slice(i).join(',').replace(/^"|"$/g, '') : cells[i];
  };
  const num = name => { const v = parseFloat(cell(name)); return isFinite(v) ? v : null; };
  const close = num('close');
  if (close == null) throw new Error('no quote (check symbol; non-US needs a suffix)');
  const open = num('open'), prev = num('prev');
  const basis = prev ? 'prev' : 'open';
  const ref = prev || open;
  return {
    name: cell('name') || null, date: cell('date') || null,
    open, high: num('high'), low: num('low'), close, volume: num('volume'), prevClose: prev,
    pct: ref ? ((close - ref) / ref) * 100 : 0, basis
  };
}
async function fetchStockQuote(sym) {
  const t = stooqTicker(sym);
  const res = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(t)}&f=sd2t2ohlcvpn&h&e=csv`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseStooqQuote(await res.text());
}
const BASIS_LABEL = { prev: 'vs previous close', open: "vs today's open", '24h': 'over 24 hours' };

// Quotes for a watchlist: crypto via CoinGecko (one batched call), $stocks via stooq.
async function fetchMarketQuotes(symbols) {
  const cryptoIds = symbols.filter(s => !s.startsWith('$')).map(s => s.toLowerCase());
  let crypto = {};
  if (cryptoIds.length) {
    try { crypto = await safeFetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(cryptoIds.join(','))}&vs_currencies=usd&include_24hr_change=true`); } catch {}
  }
  return Promise.all(symbols.map(async sym => {
    if (sym.startsWith('$')) {
      const label = sym.slice(1).toUpperCase();
      try { const q = await fetchStockQuote(sym); return { sym, label, price: q.close, pct: q.pct, basis: q.basis, ok: true }; }
      catch { return { sym, label, ok: false }; }
    }
    const d = crypto[sym.toLowerCase()];
    if (d) return { sym, label: sym.toUpperCase(), price: d.usd, pct: d.usd_24h_change ?? 0, basis: '24h', ok: true };
    return { sym, label: sym.toUpperCase(), ok: false };
  }));
}

async function refreshMarkets() {
  const items = [...marketsListEl.querySelectorAll('.monitor-item')];
  const quotes = await fetchMarketQuotes(items.map(li => li.dataset.symbol));
  items.forEach((li, i) => {
    const q = quotes[i];
    const priceEl = li.querySelector('.market-price'); const chgEl = li.querySelector('.market-change');
    if (!q.ok) { priceEl.textContent = 'n/a'; chgEl.textContent = ''; return; }
    priceEl.textContent = fmtPrice(q.price);
    setChange(chgEl, q.pct, q.basis);
  });
}
function setChange(el, pct, basis) {
  const sign = pct >= 0 ? '▲' : '▼';
  el.textContent = `${sign} ${Math.abs(pct).toFixed(2)}%`;
  el.className = 'market-change ' + (pct >= 0 ? 'up' : 'down');
  el.title = BASIS_LABEL[basis] || '';
}

const tickerTapeEl = document.getElementById('ticker-tape');
async function renderTicker() {
  if (!tickerTapeEl) return;
  const symbols = await getMarketSymbols();
  if (!symbols.length) { tickerTapeEl.innerHTML = ''; tickerTapeEl.classList.add('hidden'); return; }
  const quotes = await fetchMarketQuotes(symbols);
  const parts = quotes.map(q => {
    const d = ` data-sym="${esc(q.sym)}"`;
    if (!q.ok) return `<span class="tt-item"${d}><span class="tt-sym">${esc(q.label)}</span> <span class="tt-na">—</span></span>`;
    const arrow = q.pct >= 0 ? '▲' : '▼';
    const cls = q.pct >= 0 ? 'up' : 'down';
    const price = q.price < 1 ? q.price.toFixed(6) : q.price.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return `<span class="tt-item"${d}><span class="tt-sym">${esc(q.label)}</span> <span class="tt-price">$${price}</span> <span class="tt-chg ${cls}" title="${esc(BASIS_LABEL[q.basis] || '')}">${arrow}${Math.abs(q.pct).toFixed(2)}%</span></span>`;
  });
  const run = parts.join('<span class="tt-sep">·</span>');
  tickerTapeEl.classList.remove('hidden');
  tickerTapeEl.innerHTML = `<div class="tt-track">${run}<span class="tt-sep">·</span>${run}</div>`;
}
if (tickerTapeEl) tickerTapeEl.addEventListener('click', e => {
  const item = e.target.closest('.tt-item[data-sym]');
  if (item) openMarketModal(item.dataset.sym);
});

// ── Market detail modal ──
const marketModal = document.getElementById('market-modal');
const marketModalTitle = document.getElementById('market-modal-title');
const marketBody = document.getElementById('market-modal-body');
const marketLinks = document.getElementById('market-modal-links');

function fmtPrice(p) { return '$' + (p < 1 ? Number(p).toFixed(6) : Number(p).toLocaleString(undefined, { maximumFractionDigits: 2 })); }
function quoteBreakdownHtml({ name, price, pct, basis, rows, asof }) {
  const cls = pct >= 0 ? 'up' : 'down'; const arrow = pct >= 0 ? '▲' : '▼';
  return `<div class="md-name">${esc(name)}</div>
    <div class="md-price">${fmtPrice(price)} <span class="market-change ${cls}">${arrow}${Math.abs(pct).toFixed(2)}%</span> <small class="muted">${esc(BASIS_LABEL[basis] || '')}</small></div>
    <div class="md-rows">${rows.filter(r => r[1] != null && r[1] !== '').map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join('')}</div>
    ${asof ? `<div class="md-asof">as of ${esc(asof)}</div>` : ''}`;
}
function marketLinksHtml(links) {
  return links.map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" class="md-link">${esc(t)} ↗</a>`).join('');
}

async function openMarketModal(sym) {
  const isStock = sym.startsWith('$');
  marketModalTitle.textContent = isStock ? sym.slice(1).toUpperCase() : sym.toUpperCase();
  marketBody.innerHTML = '<span class="ask-loading">loading</span>';
  marketLinks.innerHTML = '';
  marketModal.classList.remove('hidden');
  try {
    if (isStock) {
      const t = stooqTicker(sym);
      const q = await fetchStockQuote(sym);
      const name = q.name || sym.slice(1).toUpperCase();
      const base = encodeURIComponent(t.replace(/\.us$/, '').toUpperCase());
      marketBody.innerHTML = quoteBreakdownHtml({ name, price: q.close, pct: q.pct, basis: q.basis, asof: q.date, rows: [['Prev Close', q.prevClose != null ? fmtPrice(q.prevClose) : ''], ['Open', q.open != null ? fmtPrice(q.open) : ''], ['Day High', q.high != null ? fmtPrice(q.high) : ''], ['Day Low', q.low != null ? fmtPrice(q.low) : ''], ['Volume', q.volume != null ? q.volume.toLocaleString() : '']] });
      marketLinks.innerHTML = marketLinksHtml([
        ['Yahoo Finance', `https://finance.yahoo.com/quote/${base}`],
        ['Google News', `https://news.google.com/search?q=${encodeURIComponent(name + ' stock')}`],
        ['TradingView', `https://www.tradingview.com/symbols/${base}/`],
        ['MarketWatch', `https://www.marketwatch.com/investing/stock/${base.toLowerCase()}`],
        ['stooq chart', `https://stooq.com/q/?s=${encodeURIComponent(t)}`]
      ]);
    } else {
      const arr = await safeFetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(sym.toLowerCase())}`);
      const d = arr?.[0]; if (!d) throw new Error('no quote (check the CoinGecko id)');
      marketBody.innerHTML = quoteBreakdownHtml({
        name: d.name, price: d.current_price, pct: d.price_change_percentage_24h ?? 0, basis: '24h',
        rows: [['24h High', fmtPrice(d.high_24h)], ['24h Low', fmtPrice(d.low_24h)], ['Market Cap', '$' + (d.market_cap || 0).toLocaleString()], ['Rank', d.market_cap_rank ? '#' + d.market_cap_rank : '']]
      });
      marketLinks.innerHTML = marketLinksHtml([
        ['CoinGecko', `https://www.coingecko.com/en/coins/${encodeURIComponent(sym.toLowerCase())}`],
        ['Google News', `https://news.google.com/search?q=${encodeURIComponent(d.name + ' crypto')}`],
        ['CoinMarketCap', `https://coinmarketcap.com/currencies/${encodeURIComponent(sym.toLowerCase())}/`]
      ]);
    }
  } catch (e) {
    marketBody.innerHTML = `<span class="ask-error">⚠ ${esc(e.message)}</span>` +
      (isStock ? `<p class="muted small">Stock quotes only resolve in the installed extension (host permission), not the localhost preview.</p>` : '');
  }
  // Watchlist toggle + AI take — always available, even if the quote fetch failed.
  const inList = (await getMarketSymbols()).some(s => s.toLowerCase() === sym.toLowerCase());
  marketLinks.insertAdjacentHTML('beforeend', `<button id="market-wl" class="btn-tonal btn-sm">${inList ? '★ remove from watchlist' : '☆ add to watchlist'}</button>`);
  document.getElementById('market-wl').addEventListener('click', async () => {
    let s = await getMarketSymbols();
    const exists = s.some(x => x.toLowerCase() === sym.toLowerCase());
    s = exists ? s.filter(x => x.toLowerCase() !== sym.toLowerCase()) : [...s, sym];
    await saveMarketSymbols(s);
    renderMarkets(s); refreshMarkets(); renderTicker();
    openMarketModal(sym);
  });
  marketLinks.insertAdjacentHTML('beforeend', `<button id="market-ai" class="btn-text md-ai-btn">✦ ask claude for a quick take</button>`);
  document.getElementById('market-ai').addEventListener('click', () => marketAi(sym), { once: true });
}

async function marketAi(sym) {
  const label = sym.startsWith('$') ? sym.slice(1).toUpperCase() : sym;
  const box = document.createElement('div'); box.className = 'md-ai'; box.innerHTML = '<span class="ask-loading">thinking</span>';
  marketBody.appendChild(box);
  try {
    const out = await callClaude(
      `Give a brief, neutral overview of ${label} (${sym.startsWith('$') ? 'publicly traded stock' : 'cryptocurrency'}): what the company/asset is and the major themes or catalysts associated with it. 3-4 sentences. You don't have live prices. General information only, not financial advice.`,
      { maxTokens: 260 });
    box.innerHTML = mdToHtml(out);
  } catch (e) { box.innerHTML = `<span class="ask-error">⚠ ${esc(e.message)}</span>`; }
}
async function addMarket() {
  const sym = marketSymbolEl.value.trim(); if (!sym) return;
  const s = await getMarketSymbols(); s.push(sym); await saveMarketSymbols(s);
  renderMarkets(s); marketSymbolEl.value = ''; refreshMarkets(); renderTicker();
}
document.getElementById('market-add').addEventListener('click', addMarket);
marketSymbolEl.addEventListener('keydown', e => { if (e.key === 'Enter') addMarket(); });
document.getElementById('markets-refresh').addEventListener('click', refreshMarkets);

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
  if (typeof tzd.locationTz === 'number') LOCATION_TZ = tzd.locationTz;
  updateTime();
  setInterval(updateTime, 1000);

  await loadSettings();
  _greetingPart = ''; updateTime(); // re-pick the greeting with the saved name
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

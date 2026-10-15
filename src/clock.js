import { SETTINGS } from './settings.js';

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
// Pick a fresh greeting now (e.g. after the name changes).
export function resetGreeting() { _greetingPart = ''; updateTime(); }
function refreshGreeting(h) {
  const part = partOfDay(h);
  if (part !== _greetingPart) { _greetingPart = part; _greeting = pickGreeting(h); }
  greetingEl.textContent = _greeting;
}
const timeEl = document.getElementById('time');
const greetingEl = document.getElementById('greeting');

// utc offset (seconds) of the saved location; null => use the machine's local time
let LOCATION_TZ = null;
export function setLocationTz(seconds) { LOCATION_TZ = seconds; updateTime(); }
function locationNow() {
  if (LOCATION_TZ == null) return new Date();
  const utcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
  return new Date(utcMs + LOCATION_TZ * 1000);
}
export function updateTime() {
  const now = locationNow();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  timeEl.textContent = `${hh}:${mm}:${ss}`;
  refreshGreeting(now.getHours());
}

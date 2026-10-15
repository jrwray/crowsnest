import { syncGet, syncSet } from './storage.js';

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
export function loadTheme() { syncGet('uiTheme').then(d => applyTheme(d?.uiTheme ?? 'dark')); }
modeToggleBtn.addEventListener('click', () => {
  syncGet('uiTheme').then(d => {
    const next = (d?.uiTheme ?? 'dark') === 'light' ? 'dark' : 'light';
    syncSet({ uiTheme: next }).then(() => applyTheme(next));
  });
});

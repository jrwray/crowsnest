import { CONFIG } from './config.js';
import { localGet } from './storage.js';

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS (Anthropic key/model, gnews key) — local store
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS = { userName: '', anthropicKey: '', anthropicModel: 'claude-haiku-4-5-20251001', gnewsKey: '', accent: 'blue', artAutoOpen: false };
export let SETTINGS = { ...DEFAULT_SETTINGS };

export function applyAccent(accent) {
  document.body.classList.toggle('accent-green', accent === 'green');
}

export async function loadSettings() {
  const d = await localGet('settings');
  SETTINGS = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  // Migrate retired model aliases to the current default.
  if (!SETTINGS.anthropicModel || /^claude-3-5-haiku/.test(SETTINGS.anthropicModel)) {
    SETTINGS.anthropicModel = DEFAULT_SETTINGS.anthropicModel;
  }
  if (SETTINGS.gnewsKey) CONFIG.gnewsApiKey = SETTINGS.gnewsKey;
  applyAccent(SETTINGS.accent);
}

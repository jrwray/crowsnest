import { resetGreeting } from './clock.js';
import { CONFIG } from './config.js';
import { DEFAULT_SETTINGS, SETTINGS, applyAccent } from './settings.js';
import { localSet, localStore, syncSet, syncStore } from './storage.js';

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
  resetGreeting();
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

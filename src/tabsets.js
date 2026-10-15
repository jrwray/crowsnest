import { localGet, localSet } from './storage.js';
import { openUrl } from './util.js';

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

import { getMarketSymbols, refreshMarkets, renderMarkets } from './markets.js';
import { localGet, localSet } from './storage.js';

// ─────────────────────────────────────────────────────────────────────────────
// MONITORS — modal shell + uptime (markets live in markets.js)
// ─────────────────────────────────────────────────────────────────────────────

const monitorsModal = document.getElementById('monitors-modal');
const uptimeListEl = document.getElementById('uptime-list');
const uptimeUrlEl = document.getElementById('uptime-url');

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

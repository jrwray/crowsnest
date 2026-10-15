import { localGet, localSet } from './storage.js';

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
export async function loadLinks() { const d = await localGet('links'); renderLinks(d.links ?? []); }
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

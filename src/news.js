import { callClaude } from './claude.js';
import { CONFIG } from './config.js';
import { fetchAllNews } from './feeds.js';
import { SETTINGS } from './settings.js';
import { localGet, localSet, syncSet } from './storage.js';
import { debounce, esc, mdToHtml, openUrl, timeAgo } from './util.js';

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

export async function updateNews(force = false) {
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
export function syncNewsHeight() {
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

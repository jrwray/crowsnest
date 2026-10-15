// background.js — Crowsnest service worker
// Context-menu "search selected text on site X", organized by category.
// Each site carries a `threat` level (1 = mainstream/safe, 3 = caution) and
// any site at 4+ gets a warning marker in its menu title.
console.log('Crowsnest background worker loaded');

// ─────────────────────────────────────────────────────────────────────────────
// SITE REGISTRY  (q => url).  Keep this list human-curated.
// threat: 1 safe · 2 commercial/tracking · 3 caution · 4+ flagged with ⚠
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORIES = [
  {
    id: 'search', label: 'Search', sites: [
      { id: 'g_google',  title: 'Google',      threat: 2, url: q => `https://www.google.com/search?q=${q}` },
      { id: 'g_brave',   title: 'Brave',       threat: 1, url: q => `https://search.brave.com/search?q=${q}` },
      { id: 'g_ddg',     title: 'DuckDuckGo',  threat: 1, url: q => `https://duckduckgo.com/?q=${q}` },
      { id: 'g_perplx',  title: 'Perplexity',  threat: 2, url: q => `https://www.perplexity.ai/search?q=${q}` },
    ]
  },
  {
    id: 'reference', label: 'Reference', sites: [
      { id: 'r_define',  title: 'Define',      threat: 1, url: q => `https://www.dictionary.com/browse/${q}` },
      { id: 'r_wiki',    title: 'Wikipedia',   threat: 1, url: q => `https://en.wikipedia.org/wiki/Special:Search?search=${q}` },
      { id: 'r_wolfram', title: 'Wolfram|Alpha', threat: 1, url: q => `https://www.wolframalpha.com/input?i=${q}` },
      { id: 'r_thes',    title: 'Thesaurus',   threat: 1, url: q => `https://www.thesaurus.com/browse/${q}` },
    ]
  },
  {
    id: 'dev', label: 'Dev', sites: [
      { id: 'd_github',  title: 'GitHub',      threat: 1, url: q => `https://github.com/search?q=${q}&type=repositories` },
      { id: 'd_so',      title: 'Stack Overflow', threat: 1, url: q => `https://stackoverflow.com/search?q=${q}` },
      { id: 'd_mdn',     title: 'MDN',         threat: 1, url: q => `https://developer.mozilla.org/en-US/search?q=${q}` },
      { id: 'd_npm',     title: 'npm',         threat: 2, url: q => `https://www.npmjs.com/search?q=${q}` },
    ]
  },
  {
    id: 'media', label: 'Media', sites: [
      { id: 'm_yt',      title: 'YouTube',     threat: 2, url: q => `https://www.youtube.com/results?search_query=${q}` },
      { id: 'm_imdb',    title: 'IMDb',        threat: 2, url: q => `https://www.imdb.com/find/?q=${q}` },
      { id: 'm_spotify', title: 'Spotify',     threat: 2, url: q => `https://open.spotify.com/search/${q}` },
      { id: 'm_letterbx',title: 'Letterboxd',  threat: 1, url: q => `https://letterboxd.com/search/${q}/` },
    ]
  },
  {
    id: 'maps', label: 'Maps & Places', sites: [
      { id: 'p_gmaps',   title: 'Google Maps', threat: 2, url: q => `https://www.google.com/maps/search/${q}` },
      { id: 'p_osm',     title: 'OpenStreetMap', threat: 1, url: q => `https://www.openstreetmap.org/search?query=${q}` },
    ]
  },
  {
    id: 'shop', label: 'Shopping', sites: [
      { id: 's_amazon',  title: 'Amazon',      threat: 3, url: q => `https://www.amazon.com/s?k=${q}` },
      { id: 's_ebay',    title: 'eBay',        threat: 3, url: q => `https://www.ebay.com/sch/i.html?_nkw=${q}` },
    ]
  },
];

// Flat lookup: menuItemId -> site
const SITE_BY_ID = {};
CATEGORIES.forEach(cat => cat.sites.forEach(s => { SITE_BY_ID[s.id] = s; }));

function threatTag(threat) {
  if (threat >= 5) return ' ⚠⚠';
  if (threat >= 4) return ' ⚠';
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// MENU BUILD
// ─────────────────────────────────────────────────────────────────────────────
function buildMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'crowsnest', title: 'Crowsnest ▸ search selection', contexts: ['selection']
    });
    CATEGORIES.forEach(cat => {
      const parentId = `cat_${cat.id}`;
      chrome.contextMenus.create({
        id: parentId, parentId: 'crowsnest', title: cat.label, contexts: ['selection']
      });
      cat.sites.forEach(s => {
        chrome.contextMenus.create({
          id: s.id, parentId, title: `${s.title}${threatTag(s.threat)}`, contexts: ['selection']
        });
      });
    });
  });
}

chrome.runtime.onInstalled.addListener(buildMenus);
chrome.runtime.onStartup.addListener(buildMenus);

// ─────────────────────────────────────────────────────────────────────────────
// CLICK HANDLER
// ─────────────────────────────────────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener((info) => {
  const site = SITE_BY_ID[info.menuItemId];
  if (!site) return;
  const raw = (info.selectionText || '').trim();
  if (!raw) return;
  const q = encodeURIComponent(raw);
  try {
    chrome.tabs.create({ url: site.url(q) });
  } catch (e) {
    console.error('Crowsnest: failed to open site', site.id, e);
  }
});

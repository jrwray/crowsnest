import { BUILTIN_RSS, CONFIG } from './config.js';
import { makeItem, safeFetch } from './util.js';

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

export async function fetchAllNews() {
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

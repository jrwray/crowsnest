import { callClaude } from './claude.js';
import { SETTINGS } from './settings.js';
import { esc, mdToHtml, safeFetch } from './util.js';

// ─────────────────────────────────────────────────────────────────────────────
// LIGHTBOX
// ─────────────────────────────────────────────────────────────────────────────

const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const artModalTitle = document.getElementById('art-modal-title');
const artModalMeta = document.getElementById('art-modal-meta');
const artModalAbout = document.getElementById('art-modal-about');
const artModalLink = document.getElementById('art-modal-link');

function openArtModal(a) {
  lightboxImg.src = a.src;
  artModalTitle.textContent = a.title;
  artModalMeta.textContent = [a.artist, a.date, a.medium, a.museum].filter(Boolean).join(' · ');
  artModalAbout.textContent = a.blurb || '';
  artModalAbout.classList.toggle('hidden', !a.blurb);
  artModalLink.href = a.link;
  lightbox.classList.remove('hidden'); lightbox.setAttribute('aria-hidden', 'false');
}
export function closeLightbox() {
  lightbox.classList.add('hidden'); lightbox.setAttribute('aria-hidden', 'true'); lightboxImg.src = '';
}
document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', e => { if (e.target.closest('.lightbox-info') || e.target === lightboxImg) return; closeLightbox(); });
document.getElementById('art-modal-ai').addEventListener('click', async () => {
  const a = CURRENT_ART; if (!a) return;
  artModalAbout.classList.remove('hidden');
  artModalAbout.innerHTML = '<span class="ask-loading">researching</span>';
  try {
    const out = await callClaude(
      `In 3-4 sentences, give an engaging note for someone viewing this artwork: "${a.title}" by ${a.artist}` +
      `${a.date ? ', ' + a.date : ''}${a.medium ? ', ' + a.medium : ''}, held at ${a.museum}. ` +
      `Say what it depicts and why it's notable. If you're unsure, say so briefly.`, { maxTokens: 280 });
    artModalAbout.innerHTML = mdToHtml(out);
  } catch (e) { artModalAbout.innerHTML = `<span class="ask-error">⚠ ${esc(e.message)}</span>`; }
});

// ─────────────────────────────────────────────────────────────────────────────
// ART  (Cleveland · Art Institute of Chicago · Met)
// ─────────────────────────────────────────────────────────────────────────────

const artEl = document.getElementById('art-content');

async function artCleveland() {
  const data = await safeFetch('https://openaccess-api.clevelandart.org/api/artworks/?limit=50&has_image=1&public_domain=1');
  const pool = (data?.data ?? []).filter(a => a.images?.web?.url);
  if (!pool.length) throw new Error('no cleveland art');
  const p = pool[Math.floor(Math.random() * pool.length)];
  return {
    src: p.images.web.url, title: p.title ?? 'Untitled', artist: p.creators?.[0]?.description ?? 'Unknown',
    link: p.url ?? '#', museum: 'Cleveland Museum of Art', date: p.creation_date ?? '',
    medium: p.technique ?? p.type ?? '', blurb: (p.description || p.tombstone || '').replace(/<[^>]+>/g, '')
  };
}
async function artAIC() {
  const page = 1 + Math.floor(Math.random() * 50);
  const data = await safeFetch(`https://api.artic.edu/api/v1/artworks?fields=id,title,image_id,artist_title,date_display,medium_display,place_of_origin,thumbnail&limit=50&page=${page}`);
  const pool = (data?.data ?? []).filter(a => a.image_id);
  if (!pool.length) throw new Error('no aic art');
  const p = pool[Math.floor(Math.random() * pool.length)];
  return {
    src: `https://www.artic.edu/iiif/2/${p.image_id}/full/843,/0/default.jpg`,
    title: p.title ?? 'Untitled', artist: p.artist_title ?? 'Unknown',
    link: `https://www.artic.edu/artworks/${p.id}`, museum: 'Art Institute of Chicago',
    date: p.date_display ?? '', medium: p.medium_display ?? '', blurb: p.thumbnail?.alt_text ?? ''
  };
}
async function artMet() {
  const ids = await safeFetch('https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=painting');
  const list = ids?.objectIDs ?? [];
  if (!list.length) throw new Error('no met ids');
  for (let i = 0; i < 5; i++) {
    const id = list[Math.floor(Math.random() * list.length)];
    const o = await safeFetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
    if (o?.primaryImageSmall) return {
      src: o.primaryImageSmall, title: o.title ?? 'Untitled', artist: o.artistDisplayName || 'Unknown',
      link: o.objectURL ?? '#', museum: 'The Met', date: o.objectDate ?? '', medium: o.medium ?? '',
      blurb: [o.culture, o.department].filter(Boolean).join(' · ')
    };
  }
  throw new Error('no met image');
}

let CURRENT_ART = null;
export async function getArt() {
  artEl.innerHTML = '<span class="art-loading">loading artwork…</span>';
  const sources = [artAIC, artCleveland, artMet].sort(() => Math.random() - 0.5);
  for (const src of sources) {
    try {
      const a = await src();
      CURRENT_ART = a;
      artEl.innerHTML = '';
      const img = document.createElement('img');
      img.className = 'art-thumb'; img.loading = 'lazy'; img.src = a.src; img.alt = a.title;
      img.addEventListener('click', () => openArtModal(a));
      const info = document.createElement('div'); info.className = 'art-info';
      const link = document.createElement('a'); link.className = 'art-title'; link.href = a.link;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = a.title;
      const meta = document.createElement('span'); meta.className = 'art-artist';
      meta.textContent = `${a.artist}${a.museum ? ' · ' + a.museum : ''}`;
      info.append(link, meta);
      artEl.append(img, info);
      if (SETTINGS.artAutoOpen) openArtModal(a);
      return;
    } catch { /* try next source */ }
  }
  artEl.innerHTML = '<span class="art-loading">art unavailable</span>';
}
document.getElementById('art-random').addEventListener('click', getArt);

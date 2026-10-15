import { closeLightbox } from './art.js';

// ─────────────────────────────────────────────────────────────────────────────
// MODAL helpers (generic open/close + Escape + scrim)
// ─────────────────────────────────────────────────────────────────────────────

function closeModalEl(el) { if (el) el.classList.add('hidden'); }
document.querySelectorAll('.modal-scrim[data-close]').forEach(s =>
  s.addEventListener('click', () => closeModalEl(s.closest('.modal'))));
// Every modal header close (×) button — covers article/config/settings/tabs/monitors.
document.querySelectorAll('.modal .modal-header .icon-btn').forEach(btn =>
  btn.addEventListener('click', () => closeModalEl(btn.closest('.modal'))));
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeLightbox();
  document.querySelectorAll('.modal:not(.hidden)').forEach(closeModalEl);
});

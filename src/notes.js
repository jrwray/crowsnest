import { localGet, localSet } from './storage.js';
import { debounce } from './util.js';

// ─────────────────────────────────────────────────────────────────────────────
// NOTES (Quill)
// ─────────────────────────────────────────────────────────────────────────────

const notesStatus = document.getElementById('notes-status');
let quill = null;
export async function initNotes() {
  if (typeof Quill === 'undefined') { notesStatus.textContent = 'editor unavailable'; return; }
  try {
    quill = new Quill('#notes-editor', {
      theme: 'snow',
      placeholder: 'scratchpad…',
      modules: { toolbar: [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['code-block', 'link'], ['clean']] }
    });
    const d = await localGet('notesHtml');
    if (d.notesHtml) quill.root.innerHTML = d.notesHtml;
    const save = debounce(async () => {
      await localSet({ notesHtml: quill.root.innerHTML });
      notesStatus.textContent = 'saved';
      setTimeout(() => { notesStatus.textContent = ''; }, 1200);
    }, 600);
    quill.on('text-change', () => { notesStatus.textContent = 'editing…'; save(); });
  } catch (e) {
    notesStatus.textContent = 'editor error';
    console.error('Notes init failed', e);
  }
}

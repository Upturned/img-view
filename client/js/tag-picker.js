// Shared tag picker component — used by image.js and video.js
// createTagPicker({ type })
//
// Required DOM (same IDs must exist in the page):
//   #tags-panel         — the collapsible panel (toggled with class "open")
//   #btn-tags-toggle    — button that opens/closes the panel
//   #tags-display       — chip row showing current file's tags
//   #tags-picker-row    — chip row for the all-tags picker
//   #tags-picker-search — search input inside the picker
//   #tag-input-new      — text input for creating a brand-new tag
//   #btn-add-new-tag    — button that reveals #tag-input-new
//
// Returns: { init(), loadFor(category, filename), getTags() }

function createTagPicker({ type = 'image' } = {}) {
  let currentTags     = [];
  let allTags         = [];   // [{ tag, count }]
  let pickerQuery     = '';
  let currentCategory = null;
  let currentFilename = null;

  const tagsPanel     = document.getElementById('tags-panel');
  const tagsDisplay   = document.getElementById('tags-display');
  const tagsPickerRow = document.getElementById('tags-picker-row');
  const pickerSearch  = document.getElementById('tags-picker-search');
  const tagInputNew   = document.getElementById('tag-input-new');
  const btnAddNewTag  = document.getElementById('btn-add-new-tag');

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderCurrentTags() {
    tagsDisplay.innerHTML = currentTags.map(tag =>
      `<span class="tag">${esc(tag)}<span class="tag-remove" data-tag="${esc(tag)}" title="Remove">×</span></span>`
    ).join('');
    tagsDisplay.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', () => removeTag(btn.dataset.tag));
    });
  }

  function renderPicker() {
    const q = pickerQuery.toLowerCase();
    const visible = allTags.filter(({ tag }) => !q || tag.includes(q));
    tagsPickerRow.innerHTML = visible.map(({ tag }) =>
      `<button class="tag-chip-picker${currentTags.includes(tag) ? ' active' : ''}" data-tag="${esc(tag)}">${esc(tag)}</button>`
    ).join('');
    tagsPickerRow.querySelectorAll('.tag-chip-picker').forEach(chip => {
      chip.addEventListener('click', () => togglePickerTag(chip.dataset.tag));
    });
  }

  async function togglePickerTag(tag) {
    currentTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];
    renderCurrentTags();
    renderPicker();
    await save();
  }

  async function removeTag(tag) {
    currentTags = currentTags.filter(t => t !== tag);
    renderCurrentTags();
    if (tagsPanel.classList.contains('open')) renderPicker();
    await save();
  }

  async function save() {
    if (!currentCategory || !currentFilename) return;
    try {
      await api.setImageTags(currentCategory, currentFilename, currentTags, type);
    } catch (err) {
      showToast('Failed to save tags: ' + err.message, 'error');
    }
  }

  async function loadFor(category, filename) {
    currentCategory = category;
    currentFilename = filename;
    try {
      currentTags = await api.getImageTags(category, filename, type);
    } catch {
      currentTags = [];
    }
    renderCurrentTags();
    if (tagsPanel.classList.contains('open')) renderPicker();
  }

  function init() {
    document.getElementById('btn-tags-toggle').addEventListener('click', async () => {
      tagsPanel.classList.toggle('open');
      if (tagsPanel.classList.contains('open')) {
        try { allTags = await api.getUniqueTags(undefined, type); } catch { allTags = []; }
        renderPicker();
        pickerSearch.focus();
      }
    });

    pickerSearch.addEventListener('input', () => {
      pickerQuery = pickerSearch.value.trim();
      renderPicker();
    });

    btnAddNewTag.addEventListener('click', () => {
      tagInputNew.classList.toggle('hidden');
      if (!tagInputNew.classList.contains('hidden')) tagInputNew.focus();
      else tagInputNew.value = '';
    });

    tagInputNew.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') {
        tagInputNew.classList.add('hidden');
        tagInputNew.value = '';
        return;
      }
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = tagInputNew.value.trim().toLowerCase().replace(/,/g, '');
        if (val && !currentTags.includes(val)) {
          currentTags = [...currentTags, val];
          if (!allTags.find(t => t.tag === val)) {
            allTags = [...allTags, { tag: val, count: 1 }].sort((a, b) => a.tag.localeCompare(b.tag));
          }
          renderCurrentTags();
          renderPicker();
          await save();
        }
        tagInputNew.value = '';
        tagInputNew.classList.add('hidden');
      }
    });
  }

  return { init, loadFor, getTags: () => currentTags };
}

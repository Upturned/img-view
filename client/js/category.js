// Category page — image grid with sort, filter, size slider, lazy loading

const params       = new URLSearchParams(location.search);
const categoryName = params.get('name') || '';

// State
let allImages    = [];   // full list from server
let allTagsData  = {};   // full tags.json { "cat/file": [...tags] }
let favoritesData = {};  // { "cat/file": true }
let displayList  = [];   // after client-side filters
let sortOrder    = 'asc';
let activeTags   = new Set();
let nameFilter   = '';
let favoritesOnly = false;
let tagSortMode  = 'name';   // 'name' | 'count'
let tagSearchQuery = '';
let selectionMode = false;
let selectedSet   = new Set();

// DOM refs
const grid           = document.getElementById('image-grid');
const stateLoading   = document.getElementById('state-loading');
const stateEmpty     = document.getElementById('state-empty');
const imageCount     = document.getElementById('image-count');
const sortSelect     = document.getElementById('sort-select');
const orderBtn       = document.getElementById('btn-order');
const sizeSlider     = document.getElementById('size-slider');
const searchInput    = document.getElementById('search-input');
const searchClear    = document.getElementById('search-clear');
const btnSelectMode  = document.getElementById('btn-select-mode');
const btnFavsFilter  = document.getElementById('btn-favorites-filter');
const selectionBar   = document.getElementById('selection-bar');
const selectionCount = document.getElementById('selection-count');

// --- Init ---
document.title = `${categoryName} — img-view`;
document.getElementById('breadcrumb-name').textContent = categoryName;
document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

const savedCols = localStorage.getItem('grid-cols');
if (savedCols) {
  sizeSlider.value = savedCols;
  grid.style.setProperty('--grid-cols', savedCols);
}

// --- Favorites filter button ---
btnFavsFilter.addEventListener('click', () => {
  favoritesOnly = !favoritesOnly;
  btnFavsFilter.classList.toggle('active', favoritesOnly);
  applyFilters();
});

// --- Load images ---
async function loadImages() {
  stateLoading.classList.remove('hidden');
  grid.innerHTML = '';
  stateEmpty.classList.add('hidden');

  try {
    const queryParams = { sort: sortSelect.value, order: sortOrder };
    [allImages, allTagsData, favoritesData] = await Promise.all([
      api.getCategoryImages(categoryName, queryParams),
      api.getAllTags(),
      api.getFavorites(),
    ]);
    buildTagSidebar();
    applyFilters();
  } catch (err) {
    showToast(`Failed to load category: ${err.message}`, 'error');
    stateLoading.classList.add('hidden');
  }
}

// --- Build / refresh the tag sidebar ---
function buildTagSidebar() {
  const list     = document.getElementById('tag-sidebar-list');
  const clearBtn = document.getElementById('btn-clear-tags');

  // Compute tag counts scoped to this category
  const counts = {};
  for (const img of allImages) {
    const key = `${img.category}/${img.filename}`;
    for (const tag of (allTagsData[key] || [])) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }

  let items = Object.entries(counts).map(([tag, count]) => ({ tag, count }));

  // Apply search filter
  if (tagSearchQuery) {
    items = items.filter(({ tag }) => tag.includes(tagSearchQuery));
  }

  // Apply sort
  if (tagSortMode === 'count') {
    items.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  } else {
    items.sort((a, b) => a.tag.localeCompare(b.tag));
  }

  if (items.length === 0) {
    list.innerHTML = '<span class="tag-sidebar-empty">No tags here yet.</span>';
    clearBtn.classList.add('hidden');
    return;
  }

  list.innerHTML = items.map(({ tag, count }) =>
    `<button class="tag-chip${activeTags.has(tag) ? ' active' : ''}" data-tag="${escHtml(tag)}">
      <span class="tag-chip-label">${escHtml(tag)}</span>
      <span class="tag-count">${count}</span>
    </button>`
  ).join('');

  list.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.tag;
      if (activeTags.has(tag)) { activeTags.delete(tag); chip.classList.remove('active'); }
      else                     { activeTags.add(tag);    chip.classList.add('active'); }
      clearBtn.classList.toggle('hidden', activeTags.size === 0);
      applyFilters();
    });
  });

  clearBtn.classList.toggle('hidden', activeTags.size === 0);
}

// Tag sidebar: search input
document.getElementById('tag-sidebar-search').addEventListener('input', (e) => {
  tagSearchQuery = e.target.value.trim().toLowerCase();
  buildTagSidebar();
});

// Tag sidebar: sort buttons
document.getElementById('tag-sort-name').addEventListener('click', () => {
  tagSortMode = 'name';
  document.getElementById('tag-sort-name').classList.add('active');
  document.getElementById('tag-sort-count').classList.remove('active');
  buildTagSidebar();
});

document.getElementById('tag-sort-count').addEventListener('click', () => {
  tagSortMode = 'count';
  document.getElementById('tag-sort-count').classList.add('active');
  document.getElementById('tag-sort-name').classList.remove('active');
  buildTagSidebar();
});

// --- Apply name + tag + favorites filters client-side ---
function applyFilters() {
  let list = allImages;

  if (activeTags.size > 0) {
    list = list.filter(img => {
      const key = `${img.category}/${img.filename}`;
      const imgTags = allTagsData[key] || [];
      return [...activeTags].every(t => imgTags.includes(t));
    });
  }

  if (nameFilter) {
    const q = nameFilter.toLowerCase();
    list = list.filter(img =>
      img.filename.toLowerCase().includes(q) ||
      img.name.toLowerCase().includes(q)
    );
  }

  if (favoritesOnly) {
    list = list.filter(img => !!favoritesData[`${img.category}/${img.filename}`]);
  }

  displayList = list;
  renderGrid();
}

// --- Render ---
function renderGrid() {
  stateLoading.classList.add('hidden');

  if (displayList.length === 0) {
    grid.innerHTML = '';
    stateEmpty.classList.remove('hidden');
    imageCount.textContent = '0 images';
    return;
  }

  stateEmpty.classList.add('hidden');
  imageCount.textContent = `${displayList.length} image${displayList.length !== 1 ? 's' : ''}`;

  grid.innerHTML = displayList.map((img, i) => imageCard(img, i)).join('');

  // Lazy load via IntersectionObserver
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const src = el.dataset.src;
        if (src) { el.src = src; el.removeAttribute('data-src'); }
        observer.unobserve(el);
      }
    });
  }, { rootMargin: '200px' });

  grid.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));

  // Click + context menu handlers
  grid.querySelectorAll('.card').forEach((card, i) => {
    card.addEventListener('click', () => {
      if (selectionMode) { toggleSelect(i, card); } else { openImage(i); }
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { if (selectionMode) toggleSelect(i, card); else openImage(i); }
    });

    contextMenu.on(card, () => {
      const img = displayList[i];
      const key = `${img.category}/${img.filename}`;
      const isFav = !!favoritesData[key];
      return [
        { icon: '🖼', label: 'View image',  action: () => openImage(i) },
        { label: '---' },
        { icon: '★',  label: isFav ? 'Remove favorite' : 'Add to favorites', action: () => toggleFavoriteCard(img, i) },
        { icon: '🗑', label: 'Move to recycle bin', action: () => recycleCard(img, i), disabled: isFav },
        { label: '---' },
        { icon: '✏️', label: 'Rename',      action: () => ctxRename(img.category, img.filename, 'image', (newName) => {
            displayList[i] = { ...displayList[i], filename: newName, name: newName.slice(0, newName.lastIndexOf('.')) };
            renderGrid();
          })
        },
        { icon: '📋', label: 'Copy to…',   action: () => ctxCopyTo(img.category, img.filename) },
        { icon: '✂️',  label: 'Move to…',   action: () => ctxMoveTo(img.category, img.filename, () => {
            displayList.splice(i, 1);
            allImages = allImages.filter(im => im.filename !== img.filename || im.category !== img.category);
            renderGrid();
          })
        },
        { label: '---' },
        { icon: '↗', label: 'Open with…', action: async () => {
            try { await api.openWith(img.category, img.filename, 'image'); }
            catch (err) { showToast(err.message, 'error'); }
          }
        },
      ];
    });
  });
}

function imageCard(img) {
  const selected = selectedSet.has(img.filename) ? ' selected' : '';
  const key = `${img.category}/${img.filename}`;
  const isFav = !!favoritesData[key];
  return `
    <div class="card${selected}" tabindex="0" role="button" aria-label="Open ${img.filename}">
      <div class="card-select-check">✓</div>
      ${isFav ? '<div class="card-star-badge">★</div>' : ''}
      <img
        class="card-cover"
        data-src="${thumbUrl(img.category, img.filename)}"
        src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
        alt="${escHtml(img.name)}"
      />
      <div class="card-body">
        <div class="card-title">${escHtml(img.name)}</div>
      </div>
    </div>`;
}

async function toggleFavoriteCard(img, i) {
  const key = `${img.category}/${img.filename}`;
  try {
    const result = await api.toggleFavorite(img.category, img.filename);
    if (result.favorited) favoritesData[key] = true;
    else delete favoritesData[key];
    renderGrid();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function recycleCard(img, i) {
  const key = `${img.category}/${img.filename}`;
  if (favoritesData[key]) { showToast('Remove favorite first.', 'error'); return; }
  try {
    await api.recycleImage(img.category, img.filename);
    showToast(`"${img.filename}" moved to recycle bin.`, 'success');
    displayList.splice(i, 1);
    allImages = allImages.filter(im => im.filename !== img.filename || im.category !== img.category);
    renderGrid();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openImage(index) {
  const img = displayList[index];
  sessionStorage.setItem('imageList', JSON.stringify(displayList));
  sessionStorage.setItem('imageListMeta', JSON.stringify({ category: categoryName, sort: sortSelect.value, order: sortOrder }));
  goTo('image', { category: img.category, filename: img.filename, index });
}

// --- Tag sidebar: clear button ---
document.getElementById('btn-clear-tags').addEventListener('click', () => {
  activeTags.clear();
  document.querySelectorAll('#tag-sidebar-list .tag-chip').forEach(c => c.classList.remove('active'));
  document.getElementById('btn-clear-tags').classList.add('hidden');
  applyFilters();
});

// --- Random (picks from the currently visible filtered list) ---
document.getElementById('btn-random-cat').addEventListener('click', () => {
  if (displayList.length === 0) { showToast('No images available.', 'error'); return; }
  const img = displayList[Math.floor(Math.random() * displayList.length)];
  sessionStorage.setItem('imageList', JSON.stringify(displayList));
  sessionStorage.setItem('imageListMeta', JSON.stringify({ category: categoryName }));
  goTo('image', { category: img.category, filename: img.filename });
});

// --- Sort ---
sortSelect.addEventListener('change', loadImages);

orderBtn.addEventListener('click', () => {
  sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
  orderBtn.textContent = sortOrder === 'asc' ? '↑' : '↓';
  orderBtn.title = sortOrder === 'asc' ? 'Ascending' : 'Descending';
  if (sortSelect.value !== 'random') loadImages();
});

// --- Name filter (search bar) ---
let searchDebounce = null;
searchInput.addEventListener('input', () => {
  nameFilter = searchInput.value.trim();
  searchClear.classList.toggle('hidden', nameFilter.length === 0);
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(applyFilters, 180);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  nameFilter = '';
  searchClear.classList.add('hidden');
  applyFilters();
  searchInput.focus();
});

// --- Thumbnail size slider ---
sizeSlider.addEventListener('input', () => {
  const cols = sizeSlider.value;
  grid.style.setProperty('--grid-cols', cols);
  localStorage.setItem('grid-cols', cols);
});

// --- Context menu on grid background ---
contextMenu.on(document.querySelector('main'), (e) => {
  if (e.target.closest('.card')) return null;
  return [
    { icon: '➕', label: 'Add image from…', action: () => ctxAddFile('image', categoryName, () => loadImages()) },
  ];
});

// --- Selection mode ---
function toggleSelect(index, cardEl) {
  const img = displayList[index];
  if (selectedSet.has(img.filename)) {
    selectedSet.delete(img.filename);
    cardEl.classList.remove('selected');
  } else {
    selectedSet.add(img.filename);
    cardEl.classList.add('selected');
  }
  updateSelectionBar();
}

function updateSelectionBar() {
  const n = selectedSet.size;
  selectionCount.textContent = `${n} selected`;
  document.getElementById('btn-select-move').disabled = n === 0;
  document.getElementById('btn-select-copy').disabled = n === 0;
}

function enterSelectionMode() {
  selectionMode = true;
  selectedSet.clear();
  grid.classList.add('select-mode');
  btnSelectMode.classList.add('active');
  selectionBar.classList.remove('hidden');
  updateSelectionBar();
  renderGrid();
}

function exitSelectionMode() {
  selectionMode = false;
  selectedSet.clear();
  grid.classList.remove('select-mode');
  btnSelectMode.classList.remove('active');
  selectionBar.classList.add('hidden');
  renderGrid();
}

btnSelectMode.addEventListener('click', () => {
  if (selectionMode) exitSelectionMode(); else enterSelectionMode();
});

document.getElementById('btn-select-cancel').addEventListener('click', exitSelectionMode);

document.getElementById('btn-select-all').addEventListener('click', () => {
  const allSelected = selectedSet.size === displayList.length;
  if (allSelected) { selectedSet.clear(); }
  else { displayList.forEach(img => selectedSet.add(img.filename)); }
  grid.querySelectorAll('.card').forEach((card, i) => {
    const img = displayList[i];
    if (img) card.classList.toggle('selected', selectedSet.has(img.filename));
  });
  updateSelectionBar();
});

document.getElementById('btn-select-move').addEventListener('click', async () => {
  if (selectedSet.size === 0) return;
  const files = [...selectedSet].map(filename => ({ filename, fromCategory: categoryName }));
  try {
    const categories = await api.getCategories();
    categoryPicker.show(
      `Move ${files.length} image${files.length !== 1 ? 's' : ''} to…`,
      categories.filter(c => c.name !== categoryName),
      async (dest) => {
        try {
          const result = await api.moveFiles(files, dest);
          const msg = result.errors.length
            ? `Moved ${result.moved}, ${result.errors.length} failed.`
            : `Moved ${result.moved} image${result.moved !== 1 ? 's' : ''} to "${dest}".`;
          showToast(msg, result.errors.length ? 'error' : 'success');
          exitSelectionMode();
          await loadImages();
        } catch (err) { showToast(err.message, 'error'); }
      }
    );
  } catch (err) { showToast('Failed to load categories: ' + err.message, 'error'); }
});

document.getElementById('btn-select-copy').addEventListener('click', async () => {
  if (selectedSet.size === 0) return;
  const files = [...selectedSet].map(filename => ({ filename, fromCategory: categoryName }));
  try {
    const categories = await api.getCategories();
    categoryPicker.show(
      `Copy ${files.length} image${files.length !== 1 ? 's' : ''} to…`,
      categories.filter(c => c.name !== categoryName),
      async (dest) => {
        try {
          const result = await api.copyFiles(files, dest);
          const msg = result.errors.length
            ? `Copied ${result.copied}, ${result.errors.length} failed.`
            : `Copied ${result.copied} image${result.copied !== 1 ? 's' : ''} to "${dest}".`;
          showToast(msg, result.errors.length ? 'error' : 'success');
          exitSelectionMode();
        } catch (err) { showToast(err.message, 'error'); }
      }
    );
  } catch (err) { showToast('Failed to load categories: ' + err.message, 'error'); }
});

// --- Tag all modal ---
const modalTagAll     = document.getElementById('modal-tag-all');
const tagAllInput     = document.getElementById('tag-all-input');
const tagAllChips     = document.getElementById('tag-all-chips');
const tagAllSubtitle  = document.getElementById('tag-all-subtitle');
const btnTagAllConfirm = document.getElementById('btn-tag-all-confirm');
let tagAllKnownTags   = [];   // [{ tag, count }] loaded when modal opens

document.getElementById('btn-tag-all').addEventListener('click', async () => {
  if (displayList.length === 0) { showToast('No visible images to tag.', 'error'); return; }

  tagAllSubtitle.textContent = `This will add one tag to ${displayList.length} image${displayList.length !== 1 ? 's' : ''} (does not replace existing tags).`;
  tagAllInput.value = '';
  btnTagAllConfirm.disabled = true;
  btnTagAllConfirm.textContent = 'Add tag';
  tagAllChips.innerHTML = '<span style="font-size:0.78rem;color:var(--text-muted)">Loading tags…</span>';
  modalTagAll.classList.remove('hidden');
  tagAllInput.focus();

  try {
    tagAllKnownTags = await api.getUniqueTags(categoryName);
  } catch { tagAllKnownTags = []; }
  renderTagAllChips('');
});

function renderTagAllChips(query) {
  const q = query.toLowerCase();
  const visible = tagAllKnownTags.filter(({ tag }) => !q || tag.includes(q));
  const selected = tagAllInput.value.trim().toLowerCase();

  if (visible.length === 0 && !query) {
    tagAllChips.innerHTML = '<span style="font-size:0.78rem;color:var(--text-muted)">No tags yet in this category.</span>';
    return;
  }

  tagAllChips.innerHTML = visible.map(({ tag, count }) =>
    `<button class="tag-chip-picker${tag === selected ? ' active' : ''}" data-tag="${escHtml(tag)}">
      ${escHtml(tag)} <span style="font-size:0.68rem;opacity:0.6">${count}</span>
    </button>`
  ).join('');

  tagAllChips.querySelectorAll('.tag-chip-picker').forEach(chip => {
    chip.addEventListener('click', () => {
      tagAllInput.value = chip.dataset.tag;
      btnTagAllConfirm.disabled = false;
      btnTagAllConfirm.textContent = `Add "${chip.dataset.tag}" to ${displayList.length} image${displayList.length !== 1 ? 's' : ''}`;
      renderTagAllChips(tagAllInput.value);
    });
  });
}

tagAllInput.addEventListener('input', () => {
  const val = tagAllInput.value.trim();
  btnTagAllConfirm.disabled = !val;
  if (val) btnTagAllConfirm.textContent = `Add "${val}" to ${displayList.length} image${displayList.length !== 1 ? 's' : ''}`;
  else btnTagAllConfirm.textContent = 'Add tag';
  renderTagAllChips(val);
});

tagAllInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !btnTagAllConfirm.disabled) btnTagAllConfirm.click();
  if (e.key === 'Escape') closeTagAllModal();
});

document.getElementById('btn-tag-all-cancel').addEventListener('click', closeTagAllModal);
modalTagAll.addEventListener('click', (e) => { if (e.target === modalTagAll) closeTagAllModal(); });

function closeTagAllModal() { modalTagAll.classList.add('hidden'); }

btnTagAllConfirm.addEventListener('click', async () => {
  const tag = tagAllInput.value.trim().toLowerCase();
  if (!tag) return;

  const images = displayList.map(img => ({ category: img.category, filename: img.filename }));
  btnTagAllConfirm.disabled = true;
  btnTagAllConfirm.textContent = 'Applying…';

  try {
    const result = await api.batchAddTag(images, tag);
    closeTagAllModal();
    showToast(result.message, 'success');
    // Refresh tags data so sidebar counts update
    allTagsData = await api.getAllTags().catch(() => allTagsData);
    buildTagSidebar();
  } catch (err) {
    showToast(err.message, 'error');
    btnTagAllConfirm.disabled = false;
    btnTagAllConfirm.textContent = `Add "${tag}" to ${displayList.length} image${displayList.length !== 1 ? 's' : ''}`;
  }
});

// --- Helpers ---
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- Start ---
if (!categoryName) {
  showToast('No category specified.', 'error');
} else {
  loadImages();
}

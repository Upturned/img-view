// Category page — image grid with sort, filter, size slider, lazy loading

const params       = new URLSearchParams(location.search);
const categoryName = params.get('name') || '';

// State
let allImages    = [];   // full list from server (sorted, no tag filter)
let allTagsData  = {};   // full tags.json { "cat/file": [...tags] }
let displayList  = [];   // after client-side name + tag filters
let sortOrder    = 'asc';
let activeTags   = new Set(); // currently selected sidebar tags
let nameFilter   = '';
let selectionMode = false;
let selectedSet   = new Set(); // Set of filenames currently selected

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
const selectionBar   = document.getElementById('selection-bar');
const selectionCount = document.getElementById('selection-count');

// --- Init ---
document.title = `${categoryName} — img-view`;
document.getElementById('breadcrumb-name').textContent = categoryName;
document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

// Restore saved slider position
const savedCols = localStorage.getItem('grid-cols');
if (savedCols) {
  sizeSlider.value = savedCols;
  grid.style.setProperty('--grid-cols', savedCols);
}

// --- Load images ---
async function loadImages() {
  stateLoading.classList.remove('hidden');
  grid.innerHTML = '';
  stateEmpty.classList.add('hidden');

  try {
    const queryParams = { sort: sortSelect.value, order: sortOrder };
    [allImages, allTagsData] = await Promise.all([
      api.getCategoryImages(categoryName, queryParams),
      api.getAllTags(),
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
  const list    = document.getElementById('tag-sidebar-list');
  const clearBtn = document.getElementById('btn-clear-tags');

  // Compute which tags exist in this category
  const catTags = new Set();
  for (const img of allImages) {
    const key = `${img.category}/${img.filename}`;
    (allTagsData[key] || []).forEach(t => catTags.add(t));
  }

  const sorted = [...catTags].sort();

  if (sorted.length === 0) {
    list.innerHTML = '<span class="tag-sidebar-empty">No tags here yet.</span>';
    clearBtn.classList.add('hidden');
    return;
  }

  list.innerHTML = sorted.map(tag =>
    `<button class="tag-chip${activeTags.has(tag) ? ' active' : ''}" data-tag="${escHtml(tag)}">${escHtml(tag)}</button>`
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

// --- Apply name + tag filters client-side ---
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
        if (src) {
          el.src = src;
          el.removeAttribute('data-src');
        }
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
      return [
        { icon: '🖼', label: 'View image',  action: () => openImage(i) },
        { label: '---' },
        { icon: '✏️', label: 'Rename',      action: () => ctxRename(img.category, img.filename, 'image', (newName) => {
            // Update the list in memory so the grid reflects the change immediately
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
  return `
    <div class="card${selected}" tabindex="0" role="button" aria-label="Open ${img.filename}">
      <div class="card-select-check">✓</div>
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

function openImage(index) {
  const img = displayList[index];
  // Pass the current sort/filter state so image view can replicate the same order
  // Store full list in sessionStorage so image view page can navigate prev/next
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
  // Random sort ignores order
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
  renderGrid(); // re-render to show checkboxes
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
  if (allSelected) {
    selectedSet.clear();
  } else {
    displayList.forEach(img => selectedSet.add(img.filename));
  }
  // Update card classes without full re-render
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
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    );
  } catch (err) {
    showToast('Failed to load categories: ' + err.message, 'error');
  }
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
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    );
  } catch (err) {
    showToast('Failed to load categories: ' + err.message, 'error');
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

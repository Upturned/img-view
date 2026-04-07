// Home page — categories grid, search, random, loose files banner

const searchInput    = document.getElementById('search-input');
const searchClear    = document.getElementById('search-clear');
const sectionCats    = document.getElementById('section-categories');
const sectionSearch  = document.getElementById('section-search');
const catsGrid       = document.getElementById('categories-grid');
const catsEmpty      = document.getElementById('categories-empty');
const catsTitle      = document.getElementById('categories-title');

let activeTags = new Set();

// --- Theme toggle ---
document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

// Videos/Images navigation is handled by navbar.js

// --- Global random ---
document.getElementById('btn-random-global').addEventListener('click', async () => {
  try {
    const img = await api.getRandom();
    goTo('image', { category: img.category, filename: img.filename });
  } catch {
    showToast('No images available.', 'error');
  }
});

// --- Tag sidebar ---
async function buildTagSidebar() {
  const list    = document.getElementById('tag-sidebar-list');
  const clearBtn = document.getElementById('btn-clear-tags');
  try {
    const tags = await api.getUniqueTags();
    if (tags.length === 0) {
      list.innerHTML = '<span class="tag-sidebar-empty">No tags yet.</span>';
      return;
    }
    list.innerHTML = tags.map(tag =>
      `<button class="tag-chip${activeTags.has(tag) ? ' active' : ''}" data-tag="${escHtml(tag)}">${escHtml(tag)}</button>`
    ).join('');
    list.querySelectorAll('.tag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const tag = chip.dataset.tag;
        if (activeTags.has(tag)) { activeTags.delete(tag); chip.classList.remove('active'); }
        else                     { activeTags.add(tag);    chip.classList.add('active'); }
        clearBtn.classList.toggle('hidden', activeTags.size === 0);
        onTagsChanged();
      });
    });
  } catch {
    list.innerHTML = '<span class="tag-sidebar-empty">Failed to load.</span>';
  }
}

document.getElementById('btn-clear-tags').addEventListener('click', () => {
  activeTags.clear();
  document.querySelectorAll('#tag-sidebar-list .tag-chip').forEach(c => c.classList.remove('active'));
  document.getElementById('btn-clear-tags').classList.add('hidden');
  onTagsChanged();
});

function onTagsChanged() {
  const raw = searchInput.value.trim();
  if (raw.length === 0 && activeTags.size === 0) {
    showCategories();
    return;
  }
  runSearch(raw);
}

// --- Load categories ---
async function loadCategories() {
  try {
    const categories = await api.getCategories();
    catsTitle.textContent = `Categories (${categories.length})`;

    if (categories.length === 0) {
      catsEmpty.classList.remove('hidden');
      catsGrid.innerHTML = '';
      return;
    }

    catsEmpty.classList.add('hidden');
    catsGrid.innerHTML = categories.map(cat => categoryCard(cat)).join('');

    catsGrid.querySelectorAll('.card').forEach((card, i) => {
      card.addEventListener('click', () => {
        goTo('category', { name: categories[i].name });
      });
      contextMenu.on(card, () => [
        { icon: '🗂', label: 'Open category',    action: () => goTo('category', { name: categories[i].name }) },
        { label: '---' },
        { icon: '➕', label: 'Add image from…', action: () => ctxAddFile('image', categories[i].name, () => loadCategories()) },
      ]);
    });

    // Right-click on grid background → new category
    contextMenu.on(catsGrid, (e) => {
      if (e.target.closest('.card')) return null;
      return [{ icon: '➕', label: 'New category', action: () => document.getElementById('btn-new-category').click() }];
    });
  } catch (err) {
    showToast('Failed to load categories.', 'error');
  }
}

function categoryCard(cat) {
  const cover = cat.cover
    ? `<img class="card-cover" src="${thumbUrl(cat.name, cat.cover)}" alt="${cat.name}" loading="lazy" />`
    : `<div class="card-cover-placeholder">🗂</div>`;

  return `
    <div class="card" tabindex="0" role="button" aria-label="Open category ${cat.name}">
      ${cover}
      <div class="card-body">
        <div class="card-title">${escHtml(cat.name)}</div>
        <div class="card-meta">${cat.imageCount} image${cat.imageCount !== 1 ? 's' : ''}</div>
      </div>
    </div>`;
}

// --- Search ---
let searchDebounce = null;

// Parse "#tagname" out of a raw search string.
// Returns { q: remaining text, tag: extracted tag or '' }
function parseSearchQuery(raw) {
  const tagMatch = raw.match(/#(\S+)/);
  const tag = tagMatch ? tagMatch[1].toLowerCase() : '';
  const q = raw.replace(/#\S+/g, '').trim();
  return { q, tag };
}

// Enter → go to dedicated search page
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const { q, tag: barTag } = parseSearchQuery(searchInput.value.trim());
    const allTags = [...activeTags, ...(barTag ? [barTag] : [])];
    if (q || allTags.length > 0) {
      const params = {};
      if (q) params.q = q;
      if (allTags.length === 1) params.tag = allTags[0];
      else if (allTags.length > 1) params.tags = allTags.join(',');
      goTo('search', params);
    }
  }
});

searchInput.addEventListener('input', () => {
  const raw = searchInput.value.trim();
  searchClear.classList.toggle('hidden', raw.length === 0);

  clearTimeout(searchDebounce);
  if (raw.length === 0 && activeTags.size === 0) {
    showCategories();
    return;
  }
  searchDebounce = setTimeout(() => runSearch(raw), 250);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.add('hidden');
  if (activeTags.size === 0) showCategories();
  else runSearch('');
  searchInput.focus();
});

function showCategories() {
  sectionCats.classList.remove('hidden');
  sectionSearch.classList.add('hidden');
}

async function runSearch(raw) {
  const { q, tag: barTag } = parseSearchQuery(raw);
  const allTags = [...activeTags, ...(barTag ? [barTag] : [])];
  try {
    const results = await api.search(q, 'all', allTags);
    sectionCats.classList.add('hidden');
    sectionSearch.classList.remove('hidden');

    // Categories
    const catGrid  = document.getElementById('search-categories-grid');
    const catEmpty = document.getElementById('search-categories-empty');
    if (results.categories.length === 0) {
      catGrid.innerHTML = '';
      catEmpty.classList.remove('hidden');
    } else {
      catEmpty.classList.add('hidden');
      catGrid.innerHTML = results.categories.map(cat => categoryCard(cat)).join('');
      catGrid.querySelectorAll('.card').forEach((card, i) => {
        card.addEventListener('click', () => goTo('category', { name: results.categories[i].name }));
      });
    }

    // Images
    const imgGrid  = document.getElementById('search-images-grid');
    const imgEmpty = document.getElementById('search-images-empty');
    if (results.images.length === 0) {
      imgGrid.innerHTML = '';
      imgEmpty.classList.remove('hidden');
    } else {
      imgEmpty.classList.add('hidden');
      imgGrid.innerHTML = results.images.map(img => imageSearchCard(img)).join('');
      imgGrid.querySelectorAll('.card').forEach((card, i) => {
        card.addEventListener('click', () => {
          goTo('image', { category: results.images[i].category, filename: results.images[i].filename, from: 'search', q });
        });
      });
    }
  } catch (err) {
    showToast('Search failed.', 'error');
  }
}

function imageSearchCard(img) {
  return `
    <div class="card" tabindex="0" role="button" aria-label="Open image ${img.filename}">
      <img class="card-cover" src="${thumbUrl(img.category, img.filename)}" alt="${img.name}" loading="lazy" />
      <div class="card-body">
        <div class="card-title">${escHtml(img.name)}</div>
        <div class="card-category-label">${escHtml(img.category)}</div>
      </div>
    </div>`;
}

// --- New Category modal ---
const modalNewCat   = document.getElementById('modal-new-category');
const inputCatName  = document.getElementById('input-category-name');

document.getElementById('btn-new-category').addEventListener('click', () => {
  inputCatName.value = '';
  modalNewCat.classList.remove('hidden');
  setTimeout(() => inputCatName.focus(), 50);
});

document.getElementById('btn-cancel-category').addEventListener('click', () => {
  modalNewCat.classList.add('hidden');
});

document.getElementById('btn-confirm-category').addEventListener('click', createCategory);

inputCatName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createCategory();
  if (e.key === 'Escape') modalNewCat.classList.add('hidden');
});

modalNewCat.addEventListener('click', (e) => {
  if (e.target === modalNewCat) modalNewCat.classList.add('hidden');
});

async function createCategory() {
  const name = inputCatName.value.trim();
  if (!name) return;

  try {
    await api.createCategory(name);
    modalNewCat.classList.add('hidden');
    showToast(`Category "${name}" created.`, 'success');
    await loadCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- Loose files banner ---
async function checkLooseFiles() {
  try {
    const loose = await api.getLooseFiles();
    if (loose.total === 0) return;

    const banner = document.getElementById('loose-banner');
    const text   = document.getElementById('loose-banner-text');

    const parts = [];
    if (loose.images.length) parts.push(`${loose.images.length} loose image${loose.images.length > 1 ? 's' : ''}`);
    if (loose.videos.length) parts.push(`${loose.videos.length} loose video${loose.videos.length > 1 ? 's' : ''}`);
    if (loose.others.length) parts.push(`${loose.others.length} unknown file${loose.others.length > 1 ? 's' : ''}`);
    text.textContent = `Found ${parts.join(', ')} outside any category.`;
    banner.classList.remove('hidden');
  } catch {
    // silently ignore
  }
}

document.getElementById('btn-organize').addEventListener('click', async () => {
  try {
    const [organizeResult, cleanupResult] = await Promise.all([
      api.organizeLooseFiles(),
      api.cleanupThumbs(),
    ]);
    document.getElementById('loose-banner').classList.add('hidden');
    const parts = [organizeResult.message];
    if (cleanupResult.removed > 0) parts.push(`Cleaned ${cleanupResult.removed} stale thumbnail(s).`);
    showToast(parts.join(' '), 'success');
    await loadCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('btn-dismiss-banner').addEventListener('click', () => {
  document.getElementById('loose-banner').classList.add('hidden');
});

// --- Keyboard: Enter on card ---
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement.classList.contains('card')) {
    document.activeElement.click();
  }
});

// --- Context menu on page background ---
contextMenu.on(document.querySelector('main'), (e) => {
  if (e.target.closest('.card') || e.target.closest('.modal-overlay')) return null;
  return [
    { icon: '➕', label: 'New category', action: () => document.getElementById('btn-new-category').click() },
  ];
});

// --- Helpers ---
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- Init ---
loadCategories();
checkLooseFiles();
buildTagSidebar();

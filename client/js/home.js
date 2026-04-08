// Home page — categories grid, search, random, loose files banner, favorites, recycle bin

const searchInput    = document.getElementById('search-input');
const searchClear    = document.getElementById('search-clear');
const sectionCats    = document.getElementById('section-categories');
const sectionSearch  = document.getElementById('section-search');
const sectionFavs    = document.getElementById('section-favorites');
const catsGrid       = document.getElementById('categories-grid');
const catsEmpty      = document.getElementById('categories-empty');
const catsTitle      = document.getElementById('categories-title');
const btnFavorites   = document.getElementById('btn-favorites');

let activeTags    = [];           // managed by tagSidebar
let favoritesMode = false;
let favoritesData = {};           // { "category/filename": true }

const tagSidebar = createTagSidebar({
  type: 'image',
  onFilterChange: (tags) => { activeTags = tags; onTagsChanged(); },
});

// --- Theme toggle ---
document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

// --- Global random ---
document.getElementById('btn-random-global').addEventListener('click', async () => {
  try {
    const img = await api.getRandom();
    goTo('image', { category: img.category, filename: img.filename });
  } catch {
    showToast('No images available.', 'error');
  }
});

// --- Favorites button ---
btnFavorites.addEventListener('click', () => {
  if (favoritesMode) {
    exitFavoritesMode();
  } else {
    enterFavoritesMode();
  }
});

function enterFavoritesMode() {
  favoritesMode = true;
  btnFavorites.classList.add('btn-primary');
  btnFavorites.classList.remove('btn-ghost');
  searchInput.value = '';
  searchClear.classList.add('hidden');
  tagSidebar.clear();
  showFavoritesSection();
}

function exitFavoritesMode() {
  favoritesMode = false;
  btnFavorites.classList.remove('btn-primary');
  btnFavorites.classList.add('btn-ghost');
  showCategories();
}

async function showFavoritesSection() {
  sectionCats.classList.add('hidden');
  sectionSearch.classList.add('hidden');
  sectionFavs.classList.remove('hidden');

  const favGrid  = document.getElementById('favorites-grid');
  const favEmpty = document.getElementById('favorites-empty');

  try {
    favoritesData = await api.getFavorites();
    const keys = Object.keys(favoritesData);
    if (keys.length === 0) {
      favGrid.innerHTML = '';
      favEmpty.classList.remove('hidden');
      return;
    }
    favEmpty.classList.add('hidden');
    const images = keys.map(key => {
      const slash = key.indexOf('/');
      const category = key.slice(0, slash);
      const filename = key.slice(slash + 1);
      return { category, filename, name: filename.replace(/\.[^.]+$/, '') };
    });
    favGrid.innerHTML = images.map(img => imageSearchCard(img, true)).join('');
    favGrid.querySelectorAll('.card').forEach((card, i) => {
      card.addEventListener('click', () => {
        sessionStorage.setItem('imageList', JSON.stringify(images));
        sessionStorage.setItem('imageListMeta', JSON.stringify({}));
        goTo('image', { category: images[i].category, filename: images[i].filename, index: i });
      });
    });
  } catch (err) {
    showToast('Failed to load favorites.', 'error');
  }
}


function onTagsChanged() {
  const raw = searchInput.value.trim();
  if (raw.length === 0 && activeTags.length === 0) {
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

function parseSearchQuery(raw) {
  const tagMatch = raw.match(/#(\S+)/);
  const tag = tagMatch ? tagMatch[1].toLowerCase() : '';
  const q = raw.replace(/#\S+/g, '').trim();
  return { q, tag };
}

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

  if (favoritesMode) exitFavoritesMode();

  clearTimeout(searchDebounce);
  if (raw.length === 0 && activeTags.length === 0) {
    showCategories();
    return;
  }
  searchDebounce = setTimeout(() => runSearch(raw), 250);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.add('hidden');
  if (activeTags.length === 0) showCategories();
  else runSearch('');
  searchInput.focus();
});

function showCategories() {
  sectionCats.classList.remove('hidden');
  sectionSearch.classList.add('hidden');
  sectionFavs.classList.add('hidden');
}

async function runSearch(raw) {
  const { q, tag: barTag } = parseSearchQuery(raw);
  const allTagsList = [...activeTags, ...(barTag ? [barTag] : [])];
  try {
    const results = await api.search(q, 'all', allTagsList);
    sectionCats.classList.add('hidden');
    sectionSearch.classList.remove('hidden');
    sectionFavs.classList.add('hidden');

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

    const imgGrid  = document.getElementById('search-images-grid');
    const imgEmpty = document.getElementById('search-images-empty');
    if (results.images.length === 0) {
      imgGrid.innerHTML = '';
      imgEmpty.classList.remove('hidden');
    } else {
      imgEmpty.classList.add('hidden');
      imgGrid.innerHTML = results.images.map(img => imageSearchCard(img, !!favoritesData[`${img.category}/${img.filename}`])).join('');
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

function imageSearchCard(img, isFav = false) {
  return `
    <div class="card" tabindex="0" role="button" aria-label="Open image ${img.filename}">
      ${isFav ? '<div class="card-star-badge">★</div>' : ''}
      <img class="card-cover" src="${thumbUrl(img.category, img.filename)}" alt="${escHtml(img.name)}" loading="lazy" />
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

// --- Recycle bin modal ---
const modalRecycleBin = document.getElementById('modal-recycle-bin');

document.getElementById('btn-recycle-close').addEventListener('click', () => {
  modalRecycleBin.classList.add('hidden');
});

modalRecycleBin.addEventListener('click', (e) => {
  if (e.target === modalRecycleBin) modalRecycleBin.classList.add('hidden');
});

async function openRecycleBin() {
  modalRecycleBin.classList.remove('hidden');
  await loadRecycleBin();
}

async function loadRecycleBin() {
  const list  = document.getElementById('recycle-bin-list');
  const empty = document.getElementById('recycle-bin-empty');
  list.innerHTML = '<div class="spinner"></div>';
  empty.classList.add('hidden');

  try {
    const files = await api.getRecycleBin();
    if (files.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }

    list.innerHTML = files.map(f => `
      <div class="recycle-item" data-filename="${escHtml(f.filename)}">
        <img class="recycle-item-thumb" src="/images/recycle-bin/${encodeURIComponent(f.filename)}" alt="${escHtml(f.filename)}" />
        <span class="recycle-item-name" title="${escHtml(f.filename)}">${escHtml(f.filename)}</span>
        <div class="recycle-item-actions">
          <button class="btn btn-ghost btn-sm btn-restore">Restore</button>
          <button class="btn btn-ghost btn-sm btn-delete-perm" style="color:var(--color-error,#f87171)">Delete</button>
        </div>
      </div>`).join('');

    list.querySelectorAll('.recycle-item').forEach(item => {
      const filename = item.dataset.filename;
      item.querySelector('.btn-restore').addEventListener('click', async () => {
        try {
          await api.restoreFromRecycleBin(filename);
          showToast(`"${filename}" restored to loose-images.`, 'success');
          await loadRecycleBin();
          await loadCategories();
        } catch (err) { showToast(err.message, 'error'); }
      });
      item.querySelector('.btn-delete-perm').addEventListener('click', async () => {
        if (!confirm(`Permanently delete "${filename}"? This cannot be undone.`)) return;
        try {
          await api.deleteFromRecycleBin(filename);
          showToast(`"${filename}" permanently deleted.`, 'success');
          await loadRecycleBin();
        } catch (err) { showToast(err.message, 'error'); }
      });
    });
  } catch (err) {
    list.innerHTML = `<p style="color:var(--text-muted);font-size:.875rem;">Failed to load: ${escHtml(err.message)}</p>`;
  }
}

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
    { icon: '➕', label: 'New category',  action: () => document.getElementById('btn-new-category').click() },
    { icon: '🗑', label: 'Recycle bin…', action: () => openRecycleBin() },
  ];
});

// --- Helpers ---
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- Init ---
async function init() {
  favoritesData = await api.getFavorites().catch(() => ({}));
  loadCategories();
  checkLooseFiles();
  tagSidebar.init();
}

init();

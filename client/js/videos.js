// Videos page — category list + video grid within a category + selection mode

let currentCategory = null;
let sortOrder       = 'asc';
let activeTags      = [];         // managed by tagSidebar
let allCategories   = [];
let allVideos       = [];
let displayVideos   = [];         // after client-side tag filter
let videoTagsMap    = {};         // { "category/filename": [tags] }

// Selection state (only active when #section-videos is visible)
let selectionMode = false;
let selectedSet   = new Set();    // stores filenames

const sectionCats   = document.getElementById('section-categories');
const sectionVideos = document.getElementById('section-videos');
const catsGrid      = document.getElementById('categories-grid');
const catsEmpty     = document.getElementById('categories-empty');
const catsTitle     = document.getElementById('categories-title');
const videoGrid     = document.getElementById('video-grid');
const videoEmpty    = document.getElementById('video-empty');
const videoCount    = document.getElementById('video-count');
const sortSelect    = document.getElementById('sort-select');
const orderBtn      = document.getElementById('btn-order');
const searchInput   = document.getElementById('search-input');
const searchClear   = document.getElementById('search-clear');
const sizeSlider    = document.getElementById('size-slider');
const btnSelectMode = document.getElementById('btn-select-mode');
const selectionBar  = document.getElementById('selection-bar');
const selectionCount= document.getElementById('selection-count');

document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

// Restore saved grid size
const savedCols = localStorage.getItem('video-grid-cols');
if (savedCols) {
  sizeSlider.value = savedCols;
  videoGrid.style.setProperty('--grid-cols', savedCols);
}

sizeSlider.addEventListener('input', () => {
  videoGrid.style.setProperty('--grid-cols', sizeSlider.value);
  localStorage.setItem('video-grid-cols', sizeSlider.value);
});

const tagSidebar = createTagSidebar({
  type: 'video',
  onFilterChange: (tags) => { activeTags = tags; applyFilter(); },
});

// ── Filter ──
function applyFilter() {
  if (!sectionVideos.classList.contains('hidden')) {
    displayVideos = getFilteredVideos();
    renderVideoGrid(displayVideos);
  } else {
    renderCategoryGrid(getFilteredCategories());
  }
}

function getFilteredCategories() {
  let cats = [...allCategories];
  const q = searchInput.value.trim().toLowerCase();
  if (q) cats = cats.filter(c => c.name.toLowerCase().includes(q));
  if (activeTags.length > 0) {
    cats = cats.filter(cat =>
      Object.entries(videoTagsMap).some(([key, tags]) =>
        key.startsWith(cat.name + '/') && activeTags.every(t => tags.includes(t))
      )
    );
  }
  return cats;
}

function getFilteredVideos() {
  if (activeTags.length === 0) return allVideos;
  return allVideos.filter(v => {
    const key = `${v.category}/${v.filename}`;
    const tags = videoTagsMap[key] || [];
    return activeTags.every(t => tags.includes(t));
  });
}

// ── Global random video ──
document.getElementById('btn-random-global-video').addEventListener('click', async () => {
  try {
    const v = await api.getRandomVideo();
    sessionStorage.setItem('videoList', JSON.stringify([]));
    sessionStorage.setItem('videoListMeta', JSON.stringify({ category: v.category }));
    goTo('video', { category: v.category, filename: v.filename });
  } catch {
    showToast('No videos available.', 'error');
  }
});

// ── Load categories ──
async function loadCategories() {
  try {
    allCategories = await api.getVideoCategories();
    renderCategoryGrid(getFilteredCategories());
  } catch (err) {
    showToast('Failed to load categories.', 'error');
  }
}

function renderCategoryGrid(categories) {
  catsTitle.textContent = `Video Categories (${categories.length})`;

  if (categories.length === 0) {
    catsEmpty.classList.remove('hidden');
    catsGrid.innerHTML = '';
    return;
  }

  catsEmpty.classList.add('hidden');
  catsGrid.innerHTML = categories.map(cat => categoryCard(cat)).join('');

  catsGrid.querySelectorAll('.card').forEach((card, i) => {
    card.addEventListener('click', () => openCategory(categories[i].name));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') openCategory(categories[i].name); });
    contextMenu.on(card, () => [
      { icon: '🎬', label: 'Open category',   action: () => openCategory(categories[i].name) },
      { label: '---' },
      { icon: '➕', label: 'Add video from…', action: () => ctxAddFile('video', categories[i].name, () => loadCategories()) },
    ]);
  });
}

function categoryCard(cat) {
  return `
    <div class="card" tabindex="0" role="button" aria-label="Open ${cat.name}">
      <div class="video-card-cover">
        <span>🎬</span>
      </div>
      <div class="card-body">
        <div class="card-title">${escHtml(cat.name)}</div>
        <div class="card-meta">${cat.videoCount} video${cat.videoCount !== 1 ? 's' : ''}</div>
      </div>
    </div>`;
}

// ── Open a category ──
async function openCategory(name) {
  currentCategory = name;
  document.getElementById('breadcrumb-cat-name').textContent = name;
  sectionCats.classList.add('hidden');
  sectionVideos.classList.remove('hidden');
  exitSelectionMode();
  await loadVideos();
}

// ── Load videos in current category ──
async function loadVideos() {
  if (!currentCategory) return;
  try {
    allVideos = await api.getVideos(currentCategory, { sort: sortSelect.value, order: sortOrder });
    displayVideos = getFilteredVideos();
    renderVideoGrid(displayVideos);
  } catch (err) {
    showToast('Failed to load videos: ' + err.message, 'error');
  }
}

function renderVideoGrid(videos) {
  videoCount.textContent = `${videos.length} video${videos.length !== 1 ? 's' : ''}`;

  if (videos.length === 0) {
    videoEmpty.classList.remove('hidden');
    videoGrid.innerHTML = '';
    return;
  }

  videoEmpty.classList.add('hidden');
  videoGrid.innerHTML = videos.map(v => videoCard(v)).join('');

  videoGrid.querySelectorAll('.video-thumb').forEach(vid => {
    vid.addEventListener('loadeddata', () => vid.classList.add('loaded'), { once: true });
  });

  videoGrid.querySelectorAll('.card').forEach((card, i) => {
    card.addEventListener('click', () => {
      if (selectionMode) toggleSelect(i, card);
      else openVideo(videos, i);
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter') { if (selectionMode) toggleSelect(i, card); else openVideo(videos, i); }
    });

    contextMenu.on(card, () => {
      const v = videos[i];
      return [
        { icon: '▶',  label: 'Play',            action: () => openVideo(videos, i) },
        { label: '---' },
        { icon: '🗑', label: 'Move to recycle bin', action: () => recycleCard(v, i) },
        { label: '---' },
        { icon: '✏️', label: 'Rename',           action: () => ctxRename(v.category, v.filename, 'video', () => loadVideos()) },
        { label: '---' },
        { icon: '➕', label: 'Add video from…', action: () => ctxAddFile('video', v.category, () => loadVideos()) },
      ];
    });
  });

  sessionStorage.setItem('videoList', JSON.stringify(videos));
  sessionStorage.setItem('videoListMeta', JSON.stringify({ category: currentCategory }));
}

function videoCard(v) {
  const src = videoUrl(v.category, v.filename);
  const selected = selectedSet.has(v.filename) ? ' selected' : '';
  return `
    <div class="card${selected}" tabindex="0" role="button" aria-label="Play ${v.filename}" style="position:relative;">
      <div class="card-select-check">✓</div>
      <div class="video-card-cover">
        <video class="video-thumb" src="${src}#t=0.1" muted preload="metadata"></video>
        <span class="play-icon">▶</span>
      </div>
      <div class="card-body">
        <div class="card-title">${escHtml(v.name)}</div>
      </div>
    </div>`;
}

async function recycleCard(v, i) {
  try {
    await api.recycleVideo(v.category, v.filename);
    showToast(`"${v.filename}" moved to recycle bin.`, 'success');
    displayVideos.splice(i, 1);
    allVideos = allVideos.filter(av => av.filename !== v.filename || av.category !== v.category);
    renderVideoGrid(displayVideos);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openVideo(videos, index) {
  sessionStorage.setItem('videoList', JSON.stringify(videos));
  sessionStorage.setItem('videoListMeta', JSON.stringify({ category: currentCategory }));
  goTo('video', { category: videos[index].category, filename: videos[index].filename, index });
}

// ── Back to categories ──
document.getElementById('breadcrumb-home-link').addEventListener('click', (e) => {
  e.preventDefault();
  currentCategory = null;
  allVideos = [];
  exitSelectionMode();
  sectionVideos.classList.add('hidden');
  sectionCats.classList.remove('hidden');
  renderCategoryGrid(getFilteredCategories());
});

// ── Random (category) ──
document.getElementById('btn-random-cat-video').addEventListener('click', async () => {
  if (!currentCategory) return;
  try {
    const v = await api.getRandomVideo({ category: currentCategory });
    goTo('video', { category: v.category, filename: v.filename });
  } catch {
    showToast('No videos available.', 'error');
  }
});

// ── Sort ──
sortSelect.addEventListener('change', loadVideos);
orderBtn.addEventListener('click', () => {
  sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
  orderBtn.textContent = sortOrder === 'asc' ? '↑' : '↓';
  loadVideos();
});

// ── Search / filter categories ──
let searchDebounce = null;
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  searchClear.classList.toggle('hidden', !q);
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    if (sectionVideos.classList.contains('hidden')) renderCategoryGrid(getFilteredCategories());
  }, 180);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.add('hidden');
  if (sectionVideos.classList.contains('hidden')) renderCategoryGrid(getFilteredCategories());
  searchInput.focus();
});

// ── Selection mode ──
function toggleSelect(index, cardEl) {
  const v = displayVideos[index];
  if (selectedSet.has(v.filename)) {
    selectedSet.delete(v.filename);
    cardEl.classList.remove('selected');
  } else {
    selectedSet.add(v.filename);
    cardEl.classList.add('selected');
  }
  updateSelectionBar();
}

function updateSelectionBar() {
  const n = selectedSet.size;
  selectionCount.textContent = `${n} selected`;
  document.getElementById('btn-select-move').disabled    = n === 0;
  document.getElementById('btn-select-copy').disabled    = n === 0;
  document.getElementById('btn-select-recycle').disabled = n === 0;
}

function enterSelectionMode() {
  selectionMode = true;
  selectedSet.clear();
  videoGrid.classList.add('select-mode');
  btnSelectMode.classList.add('active');
  selectionBar.classList.remove('hidden');
  updateSelectionBar();
  renderVideoGrid(displayVideos);
}

function exitSelectionMode() {
  selectionMode = false;
  selectedSet.clear();
  videoGrid.classList.remove('select-mode');
  btnSelectMode.classList.remove('active');
  selectionBar.classList.add('hidden');
  renderVideoGrid(displayVideos);
}

btnSelectMode.addEventListener('click', () => {
  if (selectionMode) exitSelectionMode(); else enterSelectionMode();
});

document.getElementById('btn-select-cancel').addEventListener('click', exitSelectionMode);

document.getElementById('btn-select-all').addEventListener('click', () => {
  const allSelected = selectedSet.size === displayVideos.length;
  if (allSelected) { selectedSet.clear(); }
  else { displayVideos.forEach(v => selectedSet.add(v.filename)); }
  videoGrid.querySelectorAll('.card').forEach((card, i) => {
    const v = displayVideos[i];
    if (v) card.classList.toggle('selected', selectedSet.has(v.filename));
  });
  updateSelectionBar();
});

document.getElementById('btn-select-move').addEventListener('click', async () => {
  if (selectedSet.size === 0) return;
  const files = [...selectedSet].map(filename => ({ filename, fromCategory: currentCategory }));
  try {
    const categories = await api.getVideoCategories();
    categoryPicker.show(
      `Move ${files.length} video${files.length !== 1 ? 's' : ''} to…`,
      categories.filter(c => c.name !== currentCategory),
      async (dest) => {
        try {
          const result = await api.moveFiles(files, dest, 'video');
          const msg = result.errors.length
            ? `Moved ${result.moved}, ${result.errors.length} failed.`
            : `Moved ${result.moved} video${result.moved !== 1 ? 's' : ''} to "${dest}".`;
          showToast(msg, result.errors.length ? 'error' : 'success');
          exitSelectionMode();
          await loadVideos();
        } catch (err) { showToast(err.message, 'error'); }
      }
    );
  } catch (err) { showToast('Failed to load categories: ' + err.message, 'error'); }
});

document.getElementById('btn-select-copy').addEventListener('click', async () => {
  if (selectedSet.size === 0) return;
  const files = [...selectedSet].map(filename => ({ filename, fromCategory: currentCategory }));
  try {
    const categories = await api.getVideoCategories();
    categoryPicker.show(
      `Copy ${files.length} video${files.length !== 1 ? 's' : ''} to…`,
      categories.filter(c => c.name !== currentCategory),
      async (dest) => {
        try {
          const result = await api.copyFiles(files, dest, 'video');
          const msg = result.errors.length
            ? `Copied ${result.copied}, ${result.errors.length} failed.`
            : `Copied ${result.copied} video${result.copied !== 1 ? 's' : ''} to "${dest}".`;
          showToast(msg, result.errors.length ? 'error' : 'success');
          exitSelectionMode();
        } catch (err) { showToast(err.message, 'error'); }
      }
    );
  } catch (err) { showToast('Failed to load categories: ' + err.message, 'error'); }
});

document.getElementById('btn-select-recycle').addEventListener('click', async () => {
  if (selectedSet.size === 0) return;
  const toRecycle = [...selectedSet];
  if (!confirm(`Move ${toRecycle.length} video${toRecycle.length !== 1 ? 's' : ''} to recycle bin?`)) return;

  let recycled = 0;
  const errors = [];
  for (const filename of toRecycle) {
    const v = allVideos.find(v => v.filename === filename);
    if (!v) continue;
    try {
      await api.recycleVideo(v.category, v.filename);
      recycled++;
    } catch {
      errors.push(filename);
    }
  }

  const msg = errors.length
    ? `Recycled ${recycled}, ${errors.length} failed.`
    : `Recycled ${recycled} video${recycled !== 1 ? 's' : ''}.`;
  showToast(msg, errors.length ? 'error' : 'success');
  exitSelectionMode();
  await loadVideos();
});

// ── New category modal ──
const modal        = document.getElementById('modal-new-category');
const inputCatName = document.getElementById('input-category-name');

document.getElementById('btn-new-category').addEventListener('click', () => {
  inputCatName.value = '';
  modal.classList.remove('hidden');
  setTimeout(() => inputCatName.focus(), 50);
});

document.getElementById('btn-cancel-category').addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

document.getElementById('btn-confirm-category').addEventListener('click', createCategory);
inputCatName.addEventListener('keydown', e => {
  if (e.key === 'Enter') createCategory();
  if (e.key === 'Escape') modal.classList.add('hidden');
});

async function createCategory() {
  const name = inputCatName.value.trim();
  if (!name) return;
  try {
    await api.createVideoCategory(name);
    modal.classList.add('hidden');
    showToast(`Category "${name}" created.`, 'success');
    await loadCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ──
async function init() {
  try { videoTagsMap = await api.getAllTags('video'); } catch { videoTagsMap = {}; }
  tagSidebar.init();
  loadCategories();
}

init();

// Videos page — category list + video grid within a category

let currentCategory = null;
let sortOrder       = 'asc';
let activeTags      = [];         // managed by tagSidebar
let allCategories   = [];
let allVideos       = [];
let videoTagsMap    = {};         // { "category/filename": [tags] } — full map for client-side filtering

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

document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

const tagSidebar = createTagSidebar({
  type: 'video',
  onFilterChange: (tags) => { activeTags = tags; applyFilter(); },
});

// ── Filter ──
function applyFilter() {
  if (!sectionVideos.classList.contains('hidden')) {
    renderVideoGrid(getFilteredVideos());
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
      { icon: '🎬', label: 'Open category',    action: () => openCategory(categories[i].name) },
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
  await loadVideos();
}

// ── Load videos in current category ──
async function loadVideos() {
  if (!currentCategory) return;
  try {
    allVideos = await api.getVideos(currentCategory, {
      sort: sortSelect.value,
      order: sortOrder,
    });
    renderVideoGrid(getFilteredVideos());
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
    card.addEventListener('click', () => openVideo(videos, i));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') openVideo(videos, i); });
    contextMenu.on(card, () => {
      const v = videos[i];
      return [
        { icon: '▶',  label: 'Play',             action: () => openVideo(videos, i) },
        { label: '---' },
        { icon: '✏️', label: 'Rename',            action: () => ctxRename(v.category, v.filename, 'video', () => loadVideos()) },
        { label: '---' },
        { icon: '➕', label: 'Add video from…',  action: () => ctxAddFile('video', v.category, () => loadVideos()) },
      ];
    });
  });

  sessionStorage.setItem('videoList', JSON.stringify(videos));
  sessionStorage.setItem('videoListMeta', JSON.stringify({ category: currentCategory }));
}

function videoCard(v) {
  const src = videoUrl(v.category, v.filename);
  return `
    <div class="card" tabindex="0" role="button" aria-label="Play ${v.filename}">
      <div class="video-card-cover">
        <video class="video-thumb" src="${src}#t=0.1" muted preload="metadata"></video>
        <span class="play-icon">▶</span>
      </div>
      <div class="card-body">
        <div class="card-title">${escHtml(v.name)}</div>
      </div>
    </div>`;
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
    if (sectionVideos.classList.contains('hidden')) {
      renderCategoryGrid(getFilteredCategories());
    }
  }, 180);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.add('hidden');
  if (sectionVideos.classList.contains('hidden')) {
    renderCategoryGrid(getFilteredCategories());
  }
  searchInput.focus();
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

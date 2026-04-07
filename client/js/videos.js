// Videos page — category list + video grid within a category

let currentCategory = null;
let sortOrder = 'asc';

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

// Global random video
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
    let categories = await api.getVideoCategories();

    const q = searchInput.value.trim().toLowerCase();
    if (q) categories = categories.filter(c => c.name.toLowerCase().includes(q));

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
  } catch (err) {
    showToast('Failed to load categories.', 'error');
  }
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
    let videos = await api.getVideos(currentCategory, {
      sort: sortSelect.value,
      order: sortOrder,
    });

    videoCount.textContent = `${videos.length} video${videos.length !== 1 ? 's' : ''}`;

    if (videos.length === 0) {
      videoEmpty.classList.remove('hidden');
      videoGrid.innerHTML = '';
      return;
    }

    videoEmpty.classList.add('hidden');
    videoGrid.innerHTML = videos.map(v => videoCard(v)).join('');

    // Lazy video preview: load first frame via <video> seek
    videoGrid.querySelectorAll('.video-thumb').forEach(vid => {
      vid.addEventListener('loadeddata', () => vid.classList.add('loaded'), { once: true });
    });

    videoGrid.querySelectorAll('.card').forEach((card, i) => {
      card.addEventListener('click', () => openVideo(videos, i));
      card.addEventListener('keydown', e => { if (e.key === 'Enter') openVideo(videos, i); });
      contextMenu.on(card, () => {
        const v = videos[i];
        return [
          { icon: '▶',  label: 'Play',        action: () => openVideo(videos, i) },
          { label: '---' },
          { icon: '✏️', label: 'Rename',       action: () => ctxRename(v.category, v.filename, 'video', (newName) => {
              videos[i] = { ...v, filename: newName, name: newName.slice(0, newName.lastIndexOf('.')) };
              loadVideos();
            })
          },
          { label: '---' },
          { icon: '➕', label: 'Add video from…', action: () => ctxAddFile('video', v.category, () => loadVideos()) },
        ];
      });
    });

    // Store list for player navigation
    sessionStorage.setItem('videoList', JSON.stringify(videos));
    sessionStorage.setItem('videoListMeta', JSON.stringify({ category: currentCategory }));
  } catch (err) {
    showToast('Failed to load videos: ' + err.message, 'error');
  }
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
  sectionVideos.classList.add('hidden');
  sectionCats.classList.remove('hidden');
});

// ── Random (category) ──
document.getElementById('btn-random-cat-video').addEventListener('click', async () => {
  if (!currentCategory) return;
  const exclude = undefined;
  try {
    const v = await api.getRandomVideo({ category: currentCategory, exclude });
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
  searchDebounce = setTimeout(loadCategories, 180);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.add('hidden');
  loadCategories();
  searchInput.focus();
});

// ── New category modal ──
const modal         = document.getElementById('modal-new-category');
const inputCatName  = document.getElementById('input-category-name');

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
loadCategories();

// Audio page — category grid + track list + persistent player bar

// ── Page state ──────────────────────────────────────────────────────────────
let currentCategory = null;
let allCategories   = [];
let allTracks       = [];
let displayTracks   = [];
let audioTagsMap    = {};
let favoritesMap    = {};
let activeTags      = [];
let sortOrder       = 'asc';
let favoritesMode   = false;

// Player state
let playerTracks = [];
let playerIndex  = -1;

// ── DOM refs ────────────────────────────────────────────────────────────────
const audioEl       = document.getElementById('audio-element');
const sectionCats   = document.getElementById('section-categories');
const sectionTracks = document.getElementById('section-tracks');
const sectionFavs   = document.getElementById('section-favorites');
const catsGrid      = document.getElementById('categories-grid');
const catsTitle     = document.getElementById('categories-title');
const catsEmpty     = document.getElementById('categories-empty');
const trackListEl   = document.getElementById('track-list');
const trackEmpty    = document.getElementById('track-empty');
const trackCount    = document.getElementById('track-count');
const sortSelect    = document.getElementById('sort-select');
const orderBtn      = document.getElementById('btn-order');
const searchInput   = document.getElementById('search-input');
const searchClear   = document.getElementById('search-clear');
const btnFavorites  = document.getElementById('btn-favorites');

// ── Theme ───────────────────────────────────────────────────────────────────
document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

// ── Tag sidebar ─────────────────────────────────────────────────────────────
const tagSidebar = createTagSidebar({
  type: 'audio',
  onFilterChange: (tags) => { activeTags = tags; applyFilter(); },
});

// ── Tag picker (in player tags panel) ───────────────────────────────────────
const tagPicker = createTagPicker({ type: 'audio' });

// ── Filtering ───────────────────────────────────────────────────────────────
function applyFilter() {
  if (!sectionTracks.classList.contains('hidden')) {
    displayTracks = getFilteredTracks();
    renderTrackList(displayTracks, trackListEl);
  } else if (!sectionFavs.classList.contains('hidden')) {
    // tags don't filter the favorites view
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
      Object.entries(audioTagsMap).some(([key, tags]) =>
        key.startsWith(cat.name + '/') && activeTags.every(t => tags.includes(t))
      )
    );
  }
  return cats;
}

function getFilteredTracks() {
  if (activeTags.length === 0) return allTracks;
  return allTracks.filter(t => {
    const tags = audioTagsMap[`${t.category}/${t.filename}`] || [];
    return activeTags.every(tag => tags.includes(tag));
  });
}

// ── Favorites ───────────────────────────────────────────────────────────────
btnFavorites.addEventListener('click', () => {
  if (favoritesMode) exitFavoritesMode();
  else enterFavoritesMode();
});

function enterFavoritesMode() {
  favoritesMode = true;
  btnFavorites.classList.replace('btn-ghost', 'btn-primary');
  sectionCats.classList.add('hidden');
  sectionTracks.classList.add('hidden');
  sectionFavs.classList.remove('hidden');
  renderFavoritesList();
}

function exitFavoritesMode() {
  favoritesMode = false;
  btnFavorites.classList.replace('btn-primary', 'btn-ghost');
  sectionFavs.classList.add('hidden');
  if (currentCategory) {
    sectionTracks.classList.remove('hidden');
  } else {
    sectionCats.classList.remove('hidden');
  }
}

function renderFavoritesList() {
  const listEl  = document.getElementById('track-list-favs');
  const emptyEl = document.getElementById('favs-empty');
  const favKeys = Object.keys(favoritesMap);
  if (favKeys.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  const tracks = favKeys.map(key => {
    const slash    = key.indexOf('/');
    const category = key.slice(0, slash);
    const filename = key.slice(slash + 1);
    return { category, filename, name: filename.replace(/\.[^.]+$/, ''), type: 'audio' };
  });
  renderTrackList(tracks, listEl);
}

// ── Global random ────────────────────────────────────────────────────────────
document.getElementById('btn-random-global-audio').addEventListener('click', async () => {
  try {
    const exclude = playerIndex >= 0 ? playerTracks[playerIndex]?.filename : undefined;
    const t = await api.getRandomAudio({ exclude });
    if (currentCategory !== t.category) await openCategory(t.category);
    const idx = allTracks.findIndex(tr => tr.filename === t.filename && tr.category === t.category);
    if (idx >= 0) loadTrack(allTracks, idx);
  } catch {
    showToast('No tracks available.', 'error');
  }
});

// ── Per-category random ───────────────────────────────────────────────────────
document.getElementById('btn-random-cat-audio').addEventListener('click', async () => {
  if (!currentCategory) return;
  try {
    const exclude = playerIndex >= 0 ? playerTracks[playerIndex]?.filename : undefined;
    const t = await api.getRandomAudio({ category: currentCategory, exclude });
    const idx = allTracks.findIndex(tr => tr.filename === t.filename);
    if (idx >= 0) loadTrack(allTracks, idx);
  } catch {
    showToast('No tracks available.', 'error');
  }
});

// ── Load categories ───────────────────────────────────────────────────────────
async function loadCategories() {
  try {
    allCategories = await api.getAudioCategories();
    renderCategoryGrid(getFilteredCategories());
  } catch {
    showToast('Failed to load categories.', 'error');
  }
}

function renderCategoryGrid(categories) {
  catsTitle.textContent = `Audio (${categories.length})`;
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
      { icon: '🎵', label: 'Open category',  action: () => openCategory(categories[i].name) },
      { label: '---' },
      { icon: '➕', label: 'Add track from…', action: () => ctxAddFile('audio', categories[i].name, loadCategories) },
    ]);
  });
}

function categoryCard(cat) {
  return `
    <div class="card" tabindex="0" role="button" aria-label="Open ${escHtml(cat.name)}">
      <div class="card-cover-placeholder" style="font-size:2.5rem;">🎵</div>
      <div class="card-body">
        <div class="card-title">${escHtml(cat.name)}</div>
        <div class="card-meta">${cat.trackCount} track${cat.trackCount !== 1 ? 's' : ''}</div>
      </div>
    </div>`;
}

// ── Open category ─────────────────────────────────────────────────────────────
async function openCategory(name) {
  currentCategory = name;
  document.getElementById('breadcrumb-cat-name').textContent = name;
  sectionCats.classList.add('hidden');
  sectionFavs.classList.add('hidden');
  sectionTracks.classList.remove('hidden');
  if (favoritesMode) { favoritesMode = false; btnFavorites.classList.replace('btn-primary', 'btn-ghost'); }
  await loadTracks();
}

// ── Back to categories ────────────────────────────────────────────────────────
document.getElementById('breadcrumb-home-link').addEventListener('click', e => {
  e.preventDefault();
  currentCategory = null;
  allTracks = [];
  sectionTracks.classList.add('hidden');
  sectionCats.classList.remove('hidden');
  renderCategoryGrid(getFilteredCategories());
});

// ── Load tracks ───────────────────────────────────────────────────────────────
async function loadTracks() {
  if (!currentCategory) return;
  try {
    allTracks = await api.getAudioTracks(currentCategory, { sort: sortSelect.value, order: sortOrder });
    displayTracks = getFilteredTracks();
    renderTrackList(displayTracks, trackListEl);
  } catch (err) {
    showToast('Failed to load tracks: ' + err.message, 'error');
  }
}

function renderTrackList(tracks, container) {
  trackCount.textContent = container === trackListEl
    ? `${tracks.length} track${tracks.length !== 1 ? 's' : ''}`
    : '';

  if (tracks.length === 0) {
    if (container === trackListEl) trackEmpty.classList.remove('hidden');
    container.innerHTML = '';
    return;
  }
  if (container === trackListEl) trackEmpty.classList.add('hidden');

  container.innerHTML = tracks.map((t, i) => {
    const key       = `${t.category}/${t.filename}`;
    const tags      = audioTagsMap[key] || [];
    const isFav     = !!favoritesMap[key];
    const isPlaying = playerIndex >= 0
      && playerTracks[playerIndex]?.filename === t.filename
      && playerTracks[playerIndex]?.category === t.category;
    return `
      <div class="track-row${isPlaying ? ' playing' : ''}" data-index="${i}">
        <span class="track-num">${isPlaying ? '♫' : i + 1}</span>
        <span class="track-name" title="${escHtml(t.filename)}">${escHtml(t.name)}</span>
        <div class="track-tags">${tags.map(tag => `<span class="tag">${escHtml(tag)}</span>`).join('')}</div>
        <button class="track-btn track-fav${isFav ? ' active' : ''}"
                data-category="${escHtml(t.category)}" data-filename="${escHtml(t.filename)}"
                title="Favorite">★</button>
      </div>`;
  }).join('');

  container.querySelectorAll('.track-row').forEach((row, i) => {
    row.addEventListener('click', e => {
      if (e.target.closest('.track-btn')) return;
      const t = tracks[i];
      const isCurrentTrack = playerIndex >= 0
        && playerTracks[playerIndex]?.filename === t.filename
        && playerTracks[playerIndex]?.category === t.category;
      if (isCurrentTrack) togglePlayPause();
      else loadTrack(tracks, i);
    });

    row.querySelector('.track-fav').addEventListener('click', async e => {
      e.stopPropagation();
      const btn = e.currentTarget;
      try {
        const result = await api.toggleFavorite(btn.dataset.category, btn.dataset.filename, 'audio');
        const key = `${btn.dataset.category}/${btn.dataset.filename}`;
        if (result.favorited) favoritesMap[key] = true;
        else delete favoritesMap[key];
        btn.classList.toggle('active', result.favorited);
        syncPlayerFavBtn(btn.dataset.category, btn.dataset.filename, result.favorited);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    contextMenu.on(row, () => {
      const t = tracks[i];
      return [
        { icon: '▶',  label: 'Play',               action: () => loadTrack(tracks, i) },
        { label: '---' },
        { icon: '🗑', label: 'Move to recycle bin', action: () => recycleTrack(t, tracks, container) },
        { label: '---' },
        { icon: '✏️', label: 'Rename',              action: () => ctxRename(t.category, t.filename, 'audio', loadTracks) },
        { label: '---' },
        { icon: '➕', label: 'Add track from…',     action: () => ctxAddFile('audio', t.category, loadTracks) },
      ];
    });
  });
}

async function recycleTrack(t, tracks, container) {
  try {
    await api.recycleAudio(t.category, t.filename);
    showToast(`"${t.filename}" moved to recycle bin.`, 'success');
    const idx = tracks.indexOf(t);
    if (idx >= 0) tracks.splice(idx, 1);
    allTracks = allTracks.filter(tr => tr.filename !== t.filename || tr.category !== t.category);
    renderTrackList(tracks, container);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Sort ──────────────────────────────────────────────────────────────────────
sortSelect.addEventListener('change', loadTracks);
orderBtn.addEventListener('click', () => {
  sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
  orderBtn.textContent = sortOrder === 'asc' ? '↑' : '↓';
  loadTracks();
});

// ── Search ────────────────────────────────────────────────────────────────────
let searchDebounce = null;
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  searchClear.classList.toggle('hidden', !q);
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    if (!sectionFavs.classList.contains('hidden')) return;
    if (!sectionTracks.classList.contains('hidden')) {
      displayTracks = getFilteredTracks();
      renderTrackList(displayTracks, trackListEl);
    } else {
      renderCategoryGrid(getFilteredCategories());
    }
  }, 180);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.add('hidden');
  if (!sectionTracks.classList.contains('hidden')) {
    displayTracks = getFilteredTracks();
    renderTrackList(displayTracks, trackListEl);
  } else {
    renderCategoryGrid(getFilteredCategories());
  }
  searchInput.focus();
});

// ── Audio player ──────────────────────────────────────────────────────────────
function loadTrack(tracks, index) {
  playerTracks = tracks;
  playerIndex  = index;
  const t      = tracks[index];

  audioEl.src = audioUrl(t.category, t.filename);
  audioEl.load();
  audioEl.play().catch(() => {});

  document.getElementById('player-title').textContent    = t.name || t.filename;
  document.getElementById('player-subtitle').textContent = t.category;
  document.getElementById('audio-player').classList.remove('hidden');

  const key = `${t.category}/${t.filename}`;
  document.getElementById('btn-player-fav').classList.toggle('active', !!favoritesMap[key]);

  tagPicker.loadFor(t.category, t.filename);
  updatePlayBtn();

  // Re-render current track list to update playing indicator
  if (!sectionTracks.classList.contains('hidden')) renderTrackList(displayTracks, trackListEl);
  if (!sectionFavs.classList.contains('hidden')) renderFavoritesList();
}

function togglePlayPause() {
  if (audioEl.paused) audioEl.play().catch(() => {});
  else audioEl.pause();
}

function updatePlayBtn() {
  document.getElementById('btn-player-play').textContent = audioEl.paused ? '▶' : '⏸';
}

audioEl.addEventListener('play',  updatePlayBtn);
audioEl.addEventListener('pause', updatePlayBtn);

audioEl.addEventListener('ended', () => {
  if (playerIndex < playerTracks.length - 1) {
    loadTrack(playerTracks, playerIndex + 1);
  }
});

audioEl.addEventListener('timeupdate', () => {
  const seek = document.getElementById('player-seek');
  if (!seek.matches(':active') && audioEl.duration) {
    seek.value = (audioEl.currentTime / audioEl.duration) * 100;
  }
  document.getElementById('player-time-current').textContent = formatTime(audioEl.currentTime);
});

audioEl.addEventListener('loadedmetadata', () => {
  document.getElementById('player-time-total').textContent = formatTime(audioEl.duration);
  document.getElementById('player-seek').value = 0;
});

document.getElementById('btn-player-play').addEventListener('click', togglePlayPause);

document.getElementById('btn-player-prev').addEventListener('click', () => {
  if (playerIndex > 0) loadTrack(playerTracks, playerIndex - 1);
});

document.getElementById('btn-player-next').addEventListener('click', () => {
  if (playerIndex < playerTracks.length - 1) loadTrack(playerTracks, playerIndex + 1);
});

document.getElementById('player-seek').addEventListener('input', () => {
  if (audioEl.duration) {
    audioEl.currentTime = (document.getElementById('player-seek').value / 100) * audioEl.duration;
  }
});

document.getElementById('player-vol').addEventListener('input', e => {
  audioEl.volume = e.target.value / 100;
  document.getElementById('btn-player-mute').textContent = audioEl.volume === 0 ? '🔇' : '🔊';
});

document.getElementById('btn-player-mute').addEventListener('click', () => {
  audioEl.muted = !audioEl.muted;
  document.getElementById('btn-player-mute').textContent = audioEl.muted ? '🔇' : '🔊';
});

document.getElementById('btn-player-fav').addEventListener('click', async () => {
  if (playerIndex < 0) return;
  const t = playerTracks[playerIndex];
  try {
    const result = await api.toggleFavorite(t.category, t.filename, 'audio');
    const key = `${t.category}/${t.filename}`;
    if (result.favorited) favoritesMap[key] = true;
    else delete favoritesMap[key];
    document.getElementById('btn-player-fav').classList.toggle('active', result.favorited);
    syncTrackRowFavBtn(t.category, t.filename, result.favorited);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('btn-player-recycle').addEventListener('click', async () => {
  if (playerIndex < 0) return;
  const t = playerTracks[playerIndex];
  try {
    await api.recycleAudio(t.category, t.filename);
    showToast(`"${t.filename}" moved to recycle bin.`, 'success');
    audioEl.pause();
    document.getElementById('audio-player').classList.add('hidden');
    playerIndex  = -1;
    playerTracks = [];
    if (currentCategory) await loadTracks();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Keep track row ★ and player ★ in sync
function syncPlayerFavBtn(category, filename, favorited) {
  if (playerIndex >= 0 && playerTracks[playerIndex]?.filename === filename
      && playerTracks[playerIndex]?.category === category) {
    document.getElementById('btn-player-fav').classList.toggle('active', favorited);
  }
}

function syncTrackRowFavBtn(category, filename, favorited) {
  document.querySelectorAll('.track-fav').forEach(btn => {
    if (btn.dataset.filename === filename && btn.dataset.category === category) {
      btn.classList.toggle('active', favorited);
    }
  });
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === ' ')        { e.preventDefault(); if (playerIndex >= 0) togglePlayPause(); }
  if (e.key === 'ArrowLeft'  && e.altKey) { e.preventDefault(); if (playerIndex > 0) loadTrack(playerTracks, playerIndex - 1); }
  if (e.key === 'ArrowRight' && e.altKey) { e.preventDefault(); if (playerIndex < playerTracks.length - 1) loadTrack(playerTracks, playerIndex + 1); }
  if (e.key === 'm' || e.key === 'M') {
    audioEl.muted = !audioEl.muted;
    document.getElementById('btn-player-mute').textContent = audioEl.muted ? '🔇' : '🔊';
  }
});

// ── New category modal ────────────────────────────────────────────────────────
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
    await api.createAudioCategory(name);
    modal.classList.add('hidden');
    showToast(`Category "${name}" created.`, 'success');
    await loadCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Context menu on background ────────────────────────────────────────────────
contextMenu.on(document.querySelector('main'), e => {
  if (e.target.closest('.card') || e.target.closest('.track-row') || e.target.closest('.modal-overlay')) return null;
  return [
    { icon: '➕', label: 'New category', action: () => document.getElementById('btn-new-category').click() },
  ];
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(sec) {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  [favoritesMap, audioTagsMap] = await Promise.all([
    api.getFavorites().catch(() => ({})),
    api.getAllTags('audio').catch(() => ({})),
  ]);
  tagSidebar.init();
  tagPicker.init();
  loadCategories();
}

init();

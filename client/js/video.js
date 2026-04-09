// Video player page — playback, prev/next, sidebar, zoom/pan, tags, recycle, open-with

const params       = new URLSearchParams(location.search);
const initCategory = params.get('category') || '';
const initFilename = params.get('filename') || '';
const initIndex    = parseInt(params.get('index') ?? '-1', 10);

let videoList    = [];
let currentIndex = 0;

function loadList() {
  try {
    const raw = sessionStorage.getItem('videoList');
    if (raw) {
      videoList = JSON.parse(raw);
      const idx = initIndex >= 0 ? initIndex
        : videoList.findIndex(v => v.category === initCategory && v.filename === initFilename);
      currentIndex = Math.max(0, idx);
      return;
    }
  } catch { /* ignore */ }

  if (initCategory && initFilename) {
    videoList    = [{ category: initCategory, filename: initFilename, name: initFilename.replace(/\.[^.]+$/, '') }];
    currentIndex = 0;
  }
}

// ── DOM refs ──
const mainVideo      = document.getElementById('main-video');
const videoFilename  = document.getElementById('video-filename');
const videoMeta      = document.getElementById('video-meta');
const videoCounter   = document.getElementById('video-counter');
const btnPrev        = document.getElementById('btn-prev');
const btnNext        = document.getElementById('btn-next');
const sidebarList    = document.getElementById('sidebar-list');
const sidebar        = document.getElementById('sidebar');
const videoContainer = document.getElementById('video-container');
const tagsPanel      = document.getElementById('tags-panel');
const zoomLabel      = document.getElementById('zoom-label');
const btnRecycle     = document.getElementById('btn-recycle');

// ── Theme ──
document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

// ── Tag picker ──
const tagPicker = createTagPicker({ type: 'video' });

// ── Zoom / Pan state ──
let zoom    = 1;
let panX    = 0;
let panY    = 0;
let isDragging  = false;
let didPan      = false;
let dragStart   = { x: 0, y: 0 };
let panStart    = { x: 0, y: 0 };

const ZOOM_MIN      = 0.1;
const ZOOM_MAX      = 10;
const ZOOM_STEP     = 0.15;
const DRAG_THRESHOLD = 5;

function applyTransform(animate = false) {
  mainVideo.style.transition = animate ? 'transform 0.15s ease' : 'none';
  mainVideo.style.transform  = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  zoomLabel.textContent = Math.round(zoom * 100) + '%';
  constrainPan();
  updateCursor();
}

function constrainPan() {
  const area = videoContainer.getBoundingClientRect();
  const maxX = zoom > 1 ? area.width  * (zoom - 1) / 2 : 0;
  const maxY = zoom > 1 ? area.height * (zoom - 1) / 2 : 0;
  panX = Math.max(-maxX, Math.min(maxX, panX));
  panY = Math.max(-maxY, Math.min(maxY, panY));
  mainVideo.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
}

function updateCursor() {
  videoContainer.classList.toggle('panning', zoom > 1 && !isDragging);
}

function resetZoom() {
  zoom = 1; panX = 0; panY = 0;
  applyTransform(true);
}

function zoomAt(clientX, clientY, delta) {
  const area = videoContainer.getBoundingClientRect();
  const cx   = clientX - area.left - area.width  / 2;
  const cy   = clientY - area.top  - area.height / 2;
  const prevZoom = zoom;
  zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * (1 + delta)));
  const scale = zoom / prevZoom;
  panX = cx - scale * (cx - panX);
  panY = cy - scale * (cy - panY);
  applyTransform();
}

// Scroll to zoom
videoContainer.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
}, { passive: false });

// Drag to pan — uses a movement threshold so short clicks still reach native video controls
videoContainer.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  isDragging = true;
  didPan     = false;
  dragStart  = { x: e.clientX, y: e.clientY };
  panStart   = { x: panX, y: panY };
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  if (!didPan && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
  didPan = true;
  panX = panStart.x + dx;
  panY = panStart.y + dy;
  constrainPan();
  videoContainer.classList.add('dragging');
});

window.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    videoContainer.classList.remove('dragging');
    updateCursor();
  }
});

// Zoom buttons
document.getElementById('btn-zoom-in').addEventListener('click',    () => { zoom = Math.min(ZOOM_MAX, zoom * (1 + ZOOM_STEP)); panX = 0; panY = 0; applyTransform(true); });
document.getElementById('btn-zoom-out').addEventListener('click',   () => { zoom = Math.max(ZOOM_MIN, zoom * (1 - ZOOM_STEP)); applyTransform(true); constrainPan(); });
document.getElementById('btn-zoom-reset').addEventListener('click', () => resetZoom());

// ── Load video ──
function loadVideo(index) {
  if (index < 0 || index >= videoList.length) return;
  currentIndex = index;
  const v = videoList[index];

  const wasPlaying = !mainVideo.paused;
  mainVideo.src = videoUrl(v.category, v.filename);
  mainVideo.load();
  if (wasPlaying || index !== initIndex) mainVideo.play().catch(() => {});

  document.title    = `${v.name} — img-view`;
  videoFilename.textContent = v.filename;
  videoMeta.textContent     = v.category;
  videoCounter.textContent  = videoList.length > 1 ? `${index + 1} / ${videoList.length}` : '';

  btnPrev.disabled = index === 0;
  btnNext.disabled = index === videoList.length - 1;

  const newParams = new URLSearchParams({ category: v.category, filename: v.filename, index });
  history.replaceState(null, '', `?${newParams}`);

  tagPicker.loadFor(v.category, v.filename);
  renderSidebar();
}

// ── Auto-advance when video ends ──
mainVideo.addEventListener('ended', () => {
  if (currentIndex < videoList.length - 1) loadVideo(currentIndex + 1);
});

// ── Navigation ──
btnPrev.addEventListener('click', () => { if (currentIndex > 0) loadVideo(currentIndex - 1); });
btnNext.addEventListener('click', () => { if (currentIndex < videoList.length - 1) loadVideo(currentIndex + 1); });

// ── Back ──
document.getElementById('btn-back').addEventListener('click', goBack);

function goBack() {
  const meta = sessionStorage.getItem('videoListMeta');
  if (meta) {
    try {
      const { category } = JSON.parse(meta);
      if (category) { goTo('videos'); return; }
    } catch { /* ignore */ }
  }
  if (document.referrer) history.back();
  else goTo('videos');
}

// ── Random ──
document.getElementById('btn-random-video').addEventListener('click', async () => {
  const v = videoList[currentIndex];
  const meta = (() => { try { return JSON.parse(sessionStorage.getItem('videoListMeta') || '{}'); } catch { return {}; } })();
  const exclude = v ? `${v.category}/${v.filename}` : undefined;
  try {
    const rand = await api.getRandomVideo({ category: meta.category, exclude });
    const idx = videoList.findIndex(i => i.category === rand.category && i.filename === rand.filename);
    if (idx >= 0) loadVideo(idx);
    else goTo('video', { category: rand.category, filename: rand.filename });
  } catch {
    showToast('No other videos available.', 'error');
  }
});

// ── Open With ──
document.getElementById('btn-open-with').addEventListener('click', async () => {
  const v = videoList[currentIndex];
  if (!v) return;
  try {
    await api.openWith(v.category, v.filename, 'video');
    showToast('Opening…', 'info', 1500);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ── Fullscreen ──
document.getElementById('btn-fullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.getElementById('player-layout').requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
});

// ── Recycle ──
btnRecycle.addEventListener('click', async () => {
  const v = videoList[currentIndex];
  if (!v) return;
  try {
    await api.recycleVideo(v.category, v.filename);
    showToast('Moved to recycle bin.', 'success');
    videoList.splice(currentIndex, 1);
    if (videoList.length === 0) { goBack(); return; }
    loadVideo(Math.min(currentIndex, videoList.length - 1));
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ── Sidebar toggle ──
document.getElementById('btn-sidebar-toggle').addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

// ── Render sidebar ──
function renderSidebar() {
  sidebarList.innerHTML = videoList.map((v, i) => {
    const active = i === currentIndex ? 'active' : '';
    const src = videoUrl(v.category, v.filename);
    return `
      <div class="sidebar-item ${active}" data-index="${i}" tabindex="0" role="button" aria-label="Play ${v.filename}">
        <video class="sidebar-thumb" src="${src}#t=0.1" muted preload="metadata"></video>
        <span class="sidebar-name">${escHtml(v.name)}</span>
      </div>`;
  }).join('');

  sidebarList.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => loadVideo(parseInt(item.dataset.index, 10)));
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter') loadVideo(parseInt(item.dataset.index, 10));
    });
  });

  const active = sidebarList.querySelector('.sidebar-item.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;

  switch (e.key) {
    case 'ArrowLeft':
      if (mainVideo.duration) mainVideo.currentTime = Math.max(0, mainVideo.currentTime - 5);
      else if (currentIndex > 0) loadVideo(currentIndex - 1);
      break;
    case 'ArrowRight':
      if (mainVideo.duration) mainVideo.currentTime = Math.min(mainVideo.duration, mainVideo.currentTime + 5);
      else if (currentIndex < videoList.length - 1) loadVideo(currentIndex + 1);
      break;
    case ' ':
      e.preventDefault();
      mainVideo.paused ? mainVideo.play() : mainVideo.pause();
      break;
    case 'Backspace':
      e.preventDefault();
      goBack();
      break;
    case 'f': case 'F':
      document.getElementById('btn-fullscreen').click();
      break;
    case 'Escape':
      if (document.fullscreenElement) document.exitFullscreen();
      else if (tagsPanel.classList.contains('open')) tagsPanel.classList.remove('open');
      break;
    case 'm': case 'M':
      mainVideo.muted = !mainVideo.muted;
      break;
    case 'ArrowUp':
      e.preventDefault();
      mainVideo.volume = Math.min(1, mainVideo.volume + 0.1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      mainVideo.volume = Math.max(0, mainVideo.volume - 0.1);
      break;
    case '+': case '=':
      document.getElementById('btn-zoom-in').click();
      break;
    case '-':
      document.getElementById('btn-zoom-out').click();
      break;
    case '0':
      resetZoom();
      break;
  }
});

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Right-click on video ──
contextMenu.on(videoContainer, () => {
  const v = videoList[currentIndex];
  if (!v) return null;
  return [
    { icon: '🗑', label: 'Move to recycle bin', action: () => btnRecycle.click() },
    { label: '---' },
    { icon: '✏️', label: 'Rename', action: () => ctxRename(v.category, v.filename, 'video', (newName) => {
        videoList[currentIndex] = { ...v, filename: newName, name: newName.slice(0, newName.lastIndexOf('.')) };
        loadVideo(currentIndex);
      })
    },
    { label: '---' },
    { icon: '↗', label: 'Open with…', action: async () => {
        try { await api.openWith(v.category, v.filename, 'video'); }
        catch (err) { showToast(err.message, 'error'); }
      }
    },
  ];
});

// ── Init ──
loadList();
tagPicker.init();
if (videoList.length > 0) {
  loadVideo(currentIndex);
} else {
  showToast('No video to display.', 'error');
}

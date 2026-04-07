// Video player page — playback, prev/next, sidebar navigation, open-with

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
const mainVideo     = document.getElementById('main-video');
const videoFilename = document.getElementById('video-filename');
const videoMeta     = document.getElementById('video-meta');
const videoCounter  = document.getElementById('video-counter');
const btnPrev       = document.getElementById('btn-prev');
const btnNext       = document.getElementById('btn-next');
const sidebarList   = document.getElementById('sidebar-list');
const sidebar       = document.getElementById('sidebar');

// ── Theme ──
document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

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

  loadTags(v.category, v.filename);
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
    if (idx >= 0) {
      loadVideo(idx);
    } else {
      goTo('video', { category: rand.category, filename: rand.filename });
    }
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

// ── Tags ──
let currentTags = [];
const tagsPanel   = document.getElementById('tags-panel');
const tagsDisplay = document.getElementById('tags-display');
const tagInput    = document.getElementById('tag-input');

document.getElementById('btn-tags-toggle').addEventListener('click', () => {
  const open = tagsPanel.style.display === 'none' || tagsPanel.style.display === '';
  tagsPanel.style.display = open ? 'block' : 'none';
  if (open) tagInput.focus();
});

async function loadTags(category, filename) {
  try {
    currentTags = await api.getImageTags(category, filename);
    renderTags();
  } catch {
    currentTags = [];
    renderTags();
  }
}

function renderTags() {
  tagsDisplay.innerHTML = currentTags.map(tag => `
    <span class="tag">
      ${escHtml(tag)}
      <span class="tag-remove" data-tag="${escHtml(tag)}" title="Remove">×</span>
    </span>`).join('');
  tagsDisplay.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => removeTag(btn.dataset.tag));
  });
}

async function saveTagsToServer() {
  const v = videoList[currentIndex];
  if (!v) return;
  try { await api.setImageTags(v.category, v.filename, currentTags); }
  catch (err) { showToast('Failed to save tags: ' + err.message, 'error'); }
}

async function removeTag(tag) {
  currentTags = currentTags.filter(t => t !== tag);
  renderTags();
  await saveTagsToServer();
}

tagInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = tagInput.value.trim().toLowerCase().replace(/,/g, '');
    if (val && !currentTags.includes(val)) {
      currentTags = [...currentTags, val];
      renderTags();
      await saveTagsToServer();
    }
    tagInput.value = '';
  }
  if (e.key === 'Backspace' && tagInput.value === '' && currentTags.length > 0) {
    currentTags = currentTags.slice(0, -1);
    renderTags();
    await saveTagsToServer();
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

  // Scroll active item into view
  const active = sidebarList.querySelector('.sidebar-item.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;

  switch (e.key) {
    case 'ArrowLeft':
      // If video is playing, seek back 5s; otherwise go to prev video
      if (mainVideo.duration) {
        mainVideo.currentTime = Math.max(0, mainVideo.currentTime - 5);
      } else {
        if (currentIndex > 0) loadVideo(currentIndex - 1);
      }
      break;
    case 'ArrowRight':
      if (mainVideo.duration) {
        mainVideo.currentTime = Math.min(mainVideo.duration, mainVideo.currentTime + 5);
      } else {
        if (currentIndex < videoList.length - 1) loadVideo(currentIndex + 1);
      }
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
  }
});

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Right-click on video ──
contextMenu.on(document.getElementById('video-panel'), () => {
  const v = videoList[currentIndex];
  if (!v) return null;
  return [
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
if (videoList.length > 0) {
  loadVideo(currentIndex);
} else {
  showToast('No video to display.', 'error');
}

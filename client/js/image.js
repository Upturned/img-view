// Image view page — zoom/pan, navigation, slideshow, keyboard shortcuts, tags

// ── URL params ──
const params       = new URLSearchParams(location.search);
const initCategory = params.get('category') || '';
const initFilename = params.get('filename') || '';
const initIndex    = parseInt(params.get('index') ?? '-1', 10);

// ── Image list (from category page via sessionStorage) ──
let imageList = [];
let currentIndex = 0;

function loadList() {
  try {
    const raw = sessionStorage.getItem('imageList');
    if (raw) {
      imageList = JSON.parse(raw);
      const idx = initIndex >= 0 ? initIndex
        : imageList.findIndex(img => img.category === initCategory && img.filename === initFilename);
      currentIndex = idx >= 0 ? idx : 0;
      return;
    }
  } catch { /* ignore */ }

  // Fallback: single image mode
  if (initCategory && initFilename) {
    imageList = [{ category: initCategory, filename: initFilename, name: initFilename.replace(/\.[^.]+$/, '') }];
    currentIndex = 0;
  }
}

// ── DOM refs ──
const mainImage      = document.getElementById('main-image');
const imgFilename    = document.getElementById('img-filename');
const imgMeta        = document.getElementById('img-meta');
const imgCounter     = document.getElementById('img-counter');
const btnPrev        = document.getElementById('btn-prev');
const btnNext        = document.getElementById('btn-next');
const imageContainer = document.getElementById('image-container');
const zoomLabel      = document.getElementById('zoom-label');
const tagsPanel      = document.getElementById('tags-panel');
const slideshowPanel = document.getElementById('slideshow-panel');
const slideshowBar   = document.getElementById('slideshow-bar');
const intervalSlider = document.getElementById('slideshow-interval');
const intervalDisplay= document.getElementById('interval-display');
const btnSlideshowPlay = document.getElementById('btn-slideshow-play');

// ── Theme ──
document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

// ── Zoom / Pan state ──
let zoom    = 1;
let panX    = 0;
let panY    = 0;
let isDragging = false;
let dragStart  = { x: 0, y: 0 };
let panStart   = { x: 0, y: 0 };

const ZOOM_MIN  = 0.1;
const ZOOM_MAX  = 10;
const ZOOM_STEP = 0.15;

function applyTransform(animate = false) {
  mainImage.style.transition = animate ? 'transform 0.15s ease' : 'opacity 0.2s';
  mainImage.style.transform  = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  zoomLabel.textContent = Math.round(zoom * 100) + '%';
  constrainPan();
  updateCursor();
}

function constrainPan() {
  if (!mainImage.naturalWidth) return;
  const area = imageContainer.getBoundingClientRect();
  const iw   = mainImage.naturalWidth  * zoom;
  const ih   = mainImage.naturalHeight * zoom;

  const maxX = iw > area.width  ? (iw - area.width)  / 2 : 0;
  const maxY = ih > area.height ? (ih - area.height) / 2 : 0;

  panX = Math.max(-maxX, Math.min(maxX, panX));
  panY = Math.max(-maxY, Math.min(maxY, panY));
  mainImage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
}

function updateCursor() {
  imageContainer.classList.remove('zoomable', 'panning', 'dragging');
  const area = imageContainer.getBoundingClientRect();
  const iw   = mainImage.naturalWidth  * zoom;
  const ih   = mainImage.naturalHeight * zoom;
  if (iw > area.width || ih > area.height) {
    imageContainer.classList.add(isDragging ? 'dragging' : 'panning');
  }
}

function resetZoom() {
  if (!mainImage.naturalWidth) return;
  const area = imageContainer.getBoundingClientRect();
  const scaleW = area.width  / mainImage.naturalWidth;
  const scaleH = area.height / mainImage.naturalHeight;

  // Default: fit-to-screen if larger than viewport, else natural size (1:1)
  if (mainImage.naturalWidth > area.width || mainImage.naturalHeight > area.height) {
    zoom = Math.min(scaleW, scaleH);
  } else {
    zoom = 1;
  }

  panX = 0;
  panY = 0;
  applyTransform(true);
}

// Zoom towards a point (clientX/Y)
function zoomAt(clientX, clientY, delta) {
  const area    = imageContainer.getBoundingClientRect();
  const cx      = clientX - area.left - area.width  / 2;
  const cy      = clientY - area.top  - area.height / 2;
  const prevZoom = zoom;

  zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * (1 + delta)));

  const scale = zoom / prevZoom;
  panX = cx - scale * (cx - panX);
  panY = cy - scale * (cy - panY);

  applyTransform();
}

// ── Scroll to zoom ──
imageContainer.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
  zoomAt(e.clientX, e.clientY, delta);
}, { passive: false });

// ── Drag to pan ──
imageContainer.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  isDragging = true;
  dragStart  = { x: e.clientX, y: e.clientY };
  panStart   = { x: panX, y: panY };
  imageContainer.classList.add('dragging');
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  panX = panStart.x + (e.clientX - dragStart.x);
  panY = panStart.y + (e.clientY - dragStart.y);
  constrainPan();
  mainImage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
});

window.addEventListener('mouseup', () => {
  isDragging = false;
  updateCursor();
});

// ── Zoom buttons ──
document.getElementById('btn-zoom-in').addEventListener('click',    () => { zoom = Math.min(ZOOM_MAX, zoom * (1 + ZOOM_STEP)); panX = 0; panY = 0; applyTransform(true); });
document.getElementById('btn-zoom-out').addEventListener('click',   () => { zoom = Math.max(ZOOM_MIN, zoom * (1 - ZOOM_STEP)); applyTransform(true); constrainPan(); });
document.getElementById('btn-zoom-reset').addEventListener('click', () => resetZoom());

// ── Load image ──
function loadImage(index) {
  if (index < 0 || index >= imageList.length) return;
  currentIndex = index;
  const img = imageList[index];

  mainImage.classList.add('loading');
  mainImage.onload = () => {
    mainImage.classList.remove('loading');
    resetZoom();
    loadTags(img.category, img.filename);
    updateActionButtons();
  };
  mainImage.onerror = () => {
    mainImage.classList.remove('loading');
    showToast('Failed to load image.', 'error');
  };
  mainImage.src = imageUrl(img.category, img.filename);
  mainImage.alt = img.name;

  // Update UI
  document.title = `${img.name} — img-view`;
  imgFilename.textContent = img.filename;
  imgMeta.textContent     = img.category;
  imgCounter.textContent  = imageList.length > 1 ? `${index + 1} / ${imageList.length}` : '';

  btnPrev.disabled = index === 0;
  btnNext.disabled = index === imageList.length - 1;

  // Update URL without reload
  const newParams = new URLSearchParams({ category: img.category, filename: img.filename, index });
  history.replaceState(null, '', `?${newParams}`);
}

// ── Navigation ──
btnPrev.addEventListener('click', () => navigate(-1));
btnNext.addEventListener('click', () => navigate(1));

function navigate(dir) {
  const next = currentIndex + dir;
  if (next >= 0 && next < imageList.length) loadImage(next);
}

// ── Back ──
document.getElementById('btn-back').addEventListener('click', goBack);

function goBack() {
  const meta = sessionStorage.getItem('imageListMeta');
  if (meta) {
    try {
      const parsed = JSON.parse(meta);
      if (parsed.fromSearch) { history.back(); return; }
      if (parsed.category)   { goTo('category', { name: parsed.category }); return; }
    } catch { /* ignore */ }
  }
  if (document.referrer) history.back();
  else goTo('home');
}

// ── Random ──
document.getElementById('btn-random').addEventListener('click', randomImage);

async function randomImage() {
  const current = imageList[currentIndex];
  const exclude = current ? `${current.category}/${current.filename}` : undefined;
  const meta    = (() => { try { return JSON.parse(sessionStorage.getItem('imageListMeta') || '{}'); } catch { return {}; } })();

  try {
    const img = await api.getRandom({
      category: meta.category,
      tag:      meta.tag,
      exclude,
    });

    // Find it in the current list and jump, or navigate to it fresh
    const idx = imageList.findIndex(i => i.category === img.category && i.filename === img.filename);
    if (idx >= 0) {
      loadImage(idx);
    } else {
      goTo('image', { category: img.category, filename: img.filename });
    }
  } catch {
    showToast('No other images available.', 'error');
  }
}

// ── Open With ──
document.getElementById('btn-open-with').addEventListener('click', async () => {
  const img = imageList[currentIndex];
  if (!img) return;
  try {
    await api.openWith(img.category, img.filename, 'image');
    showToast('Opening…', 'info', 1500);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ── Fullscreen ──
const viewer = document.getElementById('viewer');
document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    viewer.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
}

// ── Favorites & Recycle ──
let favoritesData = {};

const btnFavorite = document.getElementById('btn-favorite');
const btnRecycle  = document.getElementById('btn-recycle');

async function initFavorites() {
  try { favoritesData = await api.getFavorites(); } catch { favoritesData = {}; }
}

function updateActionButtons() {
  const img = imageList[currentIndex];
  if (!img) return;
  const key = `${img.category}/${img.filename}`;
  const isFav = !!favoritesData[key];
  btnFavorite.classList.toggle('active', isFav);
  btnFavorite.title = isFav ? 'Remove from favorites' : 'Add to favorites';
  btnRecycle.disabled = isFav;
  btnRecycle.title = isFav ? 'Remove favorite first to recycle' : 'Move to recycle bin';
}

btnFavorite.addEventListener('click', async () => {
  const img = imageList[currentIndex];
  if (!img) return;
  const key = `${img.category}/${img.filename}`;
  try {
    const result = await api.toggleFavorite(img.category, img.filename);
    if (result.favorited) favoritesData[key] = true;
    else delete favoritesData[key];
    updateActionButtons();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

btnRecycle.addEventListener('click', async () => {
  const img = imageList[currentIndex];
  if (!img) return;
  const key = `${img.category}/${img.filename}`;
  if (favoritesData[key]) { showToast('Remove favorite first.', 'error'); return; }
  try {
    await api.recycleImage(img.category, img.filename);
    showToast('Moved to recycle bin.', 'success');
    imageList.splice(currentIndex, 1);
    if (imageList.length === 0) { goBack(); return; }
    loadImage(Math.min(currentIndex, imageList.length - 1));
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ── Tags ──
let currentTags = [];
let allTags = [];      // [{ tag, count }] from server
let pickerQuery = '';  // current search filter in the picker

const tagsDisplay    = document.getElementById('tags-display');
const tagsPickerRow  = document.getElementById('tags-picker-row');
const pickerSearch   = document.getElementById('tags-picker-search');
const tagInputNew    = document.getElementById('tag-input-new');
const btnAddNewTag   = document.getElementById('btn-add-new-tag');

document.getElementById('btn-tags-toggle').addEventListener('click', async () => {
  tagsPanel.classList.toggle('open');
  if (tagsPanel.classList.contains('open')) {
    // Fetch all tags for the picker (fire async, render when ready)
    try {
      allTags = await api.getUniqueTags();
    } catch { allTags = []; }
    renderPicker();
    pickerSearch.focus();
  }
});

async function loadTags(category, filename) {
  try {
    currentTags = await api.getImageTags(category, filename);
  } catch {
    currentTags = [];
  }
  renderCurrentTags();
  // Refresh picker if panel is open (so active states update)
  if (tagsPanel.classList.contains('open')) renderPicker();
}

function renderCurrentTags() {
  tagsDisplay.innerHTML = currentTags.map(tag => `
    <span class="tag">
      ${escHtml(tag)}
      <span class="tag-remove" data-tag="${escHtml(tag)}" title="Remove tag">×</span>
    </span>`).join('');

  tagsDisplay.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => removeTag(btn.dataset.tag));
  });
}

function renderPicker() {
  const q = pickerQuery.toLowerCase();
  const visible = allTags.filter(({ tag }) => !q || tag.includes(q));

  tagsPickerRow.innerHTML = visible.map(({ tag }) =>
    `<button class="tag-chip-picker${currentTags.includes(tag) ? ' active' : ''}" data-tag="${escHtml(tag)}">${escHtml(tag)}</button>`
  ).join('');

  tagsPickerRow.querySelectorAll('.tag-chip-picker').forEach(chip => {
    chip.addEventListener('click', () => togglePickerTag(chip.dataset.tag));
  });
}

async function togglePickerTag(tag) {
  if (currentTags.includes(tag)) {
    currentTags = currentTags.filter(t => t !== tag);
  } else {
    currentTags = [...currentTags, tag];
  }
  renderCurrentTags();
  renderPicker();
  await saveTagsToServer();
}

pickerSearch.addEventListener('input', () => {
  pickerQuery = pickerSearch.value.trim();
  renderPicker();
});

btnAddNewTag.addEventListener('click', () => {
  tagInputNew.classList.toggle('hidden');
  if (!tagInputNew.classList.contains('hidden')) tagInputNew.focus();
  else { tagInputNew.value = ''; }
});

tagInputNew.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') {
    tagInputNew.classList.add('hidden');
    tagInputNew.value = '';
    return;
  }
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = tagInputNew.value.trim().toLowerCase().replace(/,/g, '');
    if (val && !currentTags.includes(val)) {
      currentTags = [...currentTags, val];
      // Add to allTags if not already present
      if (!allTags.find(t => t.tag === val)) {
        allTags = [...allTags, { tag: val, count: 1 }].sort((a, b) => a.tag.localeCompare(b.tag));
      }
      renderCurrentTags();
      renderPicker();
      await saveTagsToServer();
    }
    tagInputNew.value = '';
    tagInputNew.classList.add('hidden');
  }
});

async function saveTagsToServer() {
  const img = imageList[currentIndex];
  if (!img) return;
  try {
    await api.setImageTags(img.category, img.filename, currentTags);
  } catch (err) {
    showToast('Failed to save tags: ' + err.message, 'error');
  }
}

async function removeTag(tag) {
  currentTags = currentTags.filter(t => t !== tag);
  renderCurrentTags();
  if (tagsPanel.classList.contains('open')) renderPicker();
  await saveTagsToServer();
}

// ── Slideshow ──
let slideshowTimer  = null;
let slideshowActive = false;
let slideshowProgress = null;

document.getElementById('btn-slideshow-toggle').addEventListener('click', () => {
  slideshowPanel.classList.toggle('open');
});

intervalSlider.addEventListener('input', () => {
  intervalDisplay.textContent = intervalSlider.value + 's';
  if (slideshowActive) restartSlideshow();
});

btnSlideshowPlay.addEventListener('click', () => {
  if (slideshowActive) stopSlideshow();
  else startSlideshow();
});

function startSlideshow() {
  slideshowActive = true;
  btnSlideshowPlay.textContent = '⏹ Stop';
  slideshowPanel.classList.remove('open');
  scheduleNext();
}

function stopSlideshow() {
  slideshowActive = false;
  btnSlideshowPlay.textContent = '▶ Start';
  clearTimeout(slideshowTimer);
  slideshowBar.classList.add('hidden');
  slideshowBar.style.width = '0%';
  slideshowBar.style.transition = 'none';
}

function restartSlideshow() {
  clearTimeout(slideshowTimer);
  scheduleNext();
}

function scheduleNext() {
  if (!slideshowActive) return;
  const ms = parseInt(intervalSlider.value, 10) * 1000;

  // Animate progress bar
  slideshowBar.classList.remove('hidden');
  slideshowBar.style.transition = 'none';
  slideshowBar.style.width = '0%';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      slideshowBar.style.transition = `width ${ms}ms linear`;
      slideshowBar.style.width = '100%';
    });
  });

  slideshowTimer = setTimeout(() => {
    if (!slideshowActive) return;
    const next = currentIndex + 1;
    if (next < imageList.length) {
      loadImage(next);
      scheduleNext();
    } else {
      // Loop back to start
      loadImage(0);
      scheduleNext();
    }
  }, ms);
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', (e) => {
  // Don't fire when typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key) {
    case 'ArrowLeft':  e.preventDefault(); navigate(-1);       break;
    case 'ArrowRight': e.preventDefault(); navigate(1);        break;
    case 'Backspace':  e.preventDefault(); goBack();           break;
    case 'r': case 'R': randomImage();                         break;
    case 'f': case 'F': toggleFullscreen();                    break;
    case 'Escape':
      if (document.fullscreenElement) document.exitFullscreen();
      else if (slideshowActive) stopSlideshow();
      else if (tagsPanel.classList.contains('open')) {
        tagsPanel.classList.remove('open');
        pickerQuery = '';
        pickerSearch.value = '';
      }
      else if (slideshowPanel.classList.contains('open')) slideshowPanel.classList.remove('open');
      break;
    case '+': case '=': document.getElementById('btn-zoom-in').click();    break;
    case '-':           document.getElementById('btn-zoom-out').click();   break;
    case '0':           resetZoom();                           break;
  }
});

// Close slideshow panel when clicking outside
document.addEventListener('click', (e) => {
  if (!slideshowPanel.contains(e.target) && e.target !== document.getElementById('btn-slideshow-toggle')) {
    slideshowPanel.classList.remove('open');
  }
});

// ── Helpers ──
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Right-click on image ──
contextMenu.on(imageContainer, () => {
  const img = imageList[currentIndex];
  if (!img) return null;
  const key = `${img.category}/${img.filename}`;
  const isFav = !!favoritesData[key];
  return [
    { icon: '★',  label: isFav ? 'Remove favorite' : 'Add to favorites', action: () => btnFavorite.click() },
    { icon: '🗑', label: 'Move to recycle bin', action: () => btnRecycle.click(), disabled: isFav },
    { label: '---' },
    { icon: '📋', label: 'Copy to…',   action: () => ctxCopyTo(img.category, img.filename) },
    { icon: '✂️',  label: 'Move to…',   action: () => ctxMoveTo(img.category, img.filename, () => {
        imageList.splice(currentIndex, 1);
        if (imageList.length === 0) { goBack(); return; }
        loadImage(Math.min(currentIndex, imageList.length - 1));
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

// ── Init ──
loadList();
initFavorites().then(() => {
  if (imageList.length > 0) {
    loadImage(currentIndex);
  } else {
    showToast('No image to display.', 'error');
  }
});

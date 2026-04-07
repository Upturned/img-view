// Search page — global search across images and categories by name and/or tag

const urlParams   = new URLSearchParams(location.search);
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const totalCount  = document.getElementById('total-count');
const stateInit   = document.getElementById('state-initial');
const stateLoad   = document.getElementById('state-loading');
const resultsEl   = document.getElementById('results');

let activeTab   = 'all';
let lastResults = { images: [], categories: [] };
let searchDebounce = null;
let activeTags  = new Set();

// ── Theme ──
document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

// ── Pre-fill from URL ──
const initQuery = urlParams.get('q') || '';
const initTagsParam = urlParams.get('tags') || '';
const initTag   = urlParams.get('tag') || '';
const initTagList = initTagsParam ? initTagsParam.split(',').filter(Boolean) : (initTag ? [initTag] : []);

// Put tags into activeTags immediately (sidebar chips will be selected when built)
initTagList.forEach(t => activeTags.add(t.toLowerCase()));

// Build display value in the search bar (text only; tags shown in sidebar)
if (initQuery) {
  searchInput.value = initQuery;
  searchClear.classList.remove('hidden');
}

// ── Tag sidebar ──
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
        runSearch();
      });
    });
    clearBtn.classList.toggle('hidden', activeTags.size === 0);
  } catch {
    list.innerHTML = '<span class="tag-sidebar-empty">Failed to load.</span>';
  }
}

document.getElementById('btn-clear-tags').addEventListener('click', () => {
  activeTags.clear();
  document.querySelectorAll('#tag-sidebar-list .tag-chip').forEach(c => c.classList.remove('active'));
  document.getElementById('btn-clear-tags').classList.add('hidden');
  runSearch();
});

// Parse "#tagname" out of a raw search string.
function parseSearchQuery(raw) {
  const tagMatch = raw.match(/#(\S+)/);
  const tag = tagMatch ? tagMatch[1].toLowerCase() : '';
  const q = raw.replace(/#\S+/g, '').trim();
  return { q, tag };
}

// ── Search ──
async function runSearch() {
  const { q, tag: barTag } = parseSearchQuery(searchInput.value.trim());
  // Combine sidebar tags + #tag from bar (AND logic)
  const allTags = [...activeTags, ...(barTag ? [barTag] : [])];

  if (!q && allTags.length === 0) {
    stateInit.classList.remove('hidden');
    resultsEl.classList.add('hidden');
    stateLoad.classList.add('hidden');
    totalCount.textContent = '';
    updateCounts({ images: [], categories: [] });
    updateURL(q, allTags);
    return;
  }

  stateInit.classList.add('hidden');
  stateLoad.classList.remove('hidden');
  resultsEl.classList.add('hidden');

  try {
    const results = await api.search(q, 'all', allTags);
    lastResults = results;
    stateLoad.classList.add('hidden');
    resultsEl.classList.remove('hidden');
    updateCounts(results);
    renderAll(results);
    const total = results.images.length + results.categories.length;
    totalCount.textContent = total > 0 ? `${total} result${total !== 1 ? 's' : ''}` : 'No results';
    updateURL(q, allTags);
  } catch (err) {
    stateLoad.classList.add('hidden');
    showToast('Search failed: ' + err.message, 'error');
  }
}

function updateURL(q, tags) {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (tags.length === 1) p.set('tag', tags[0]);
  else if (tags.length > 1) p.set('tags', tags.join(','));
  history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
  document.title = q ? `"${q}" — Search — img-view` : 'Search — img-view';
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Render ──
function renderAll(results) {
  renderCategoryGrid('all-categories-grid', 'all-categories-none', results.categories);
  renderImageGrid('all-images-grid', 'all-images-none', results.images);
  renderCategoryGrid('categories-grid', 'categories-none', results.categories);
  renderImageGrid('images-grid', 'images-none', results.images);
}

function renderCategoryGrid(gridId, emptyId, categories) {
  const grid  = document.getElementById(gridId);
  const empty = document.getElementById(emptyId);

  if (categories.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = categories.map(cat => categoryCard(cat)).join('');
  grid.querySelectorAll('.card').forEach((card, i) => {
    card.addEventListener('click', () => goTo('category', { name: categories[i].name }));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') goTo('category', { name: categories[i].name }); });
  });
}

function renderImageGrid(gridId, emptyId, images) {
  const grid  = document.getElementById(gridId);
  const empty = document.getElementById(emptyId);

  if (images.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = images.map(img => imageCard(img)).join('');

  // Lazy load
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        if (el.dataset.src) { el.src = el.dataset.src; el.removeAttribute('data-src'); }
        observer.unobserve(el);
      }
    });
  }, { rootMargin: '200px' });

  grid.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));

  grid.querySelectorAll('.card').forEach((card, i) => {
    card.addEventListener('click', () => openImage(images, i));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') openImage(images, i); });
  });
}

function openImage(images, index) {
  sessionStorage.setItem('imageList', JSON.stringify(images));
  sessionStorage.setItem('imageListMeta', JSON.stringify({ fromSearch: true }));
  goTo('image', { category: images[index].category, filename: images[index].filename, index });
}

function categoryCard(cat) {
  const cover = cat.cover
    ? `<img class="card-cover" src="${thumbUrl(cat.name, cat.cover)}" alt="${cat.name}" loading="lazy" />`
    : `<div class="card-cover-placeholder">🗂</div>`;
  return `
    <div class="card" tabindex="0" role="button">
      ${cover}
      <div class="card-body">
        <div class="card-title">${escHtml(cat.name)}</div>
        <div class="card-meta">${cat.imageCount} image${cat.imageCount !== 1 ? 's' : ''}</div>
      </div>
    </div>`;
}

function imageCard(img) {
  return `
    <div class="card" tabindex="0" role="button">
      <img class="card-cover"
        data-src="${thumbUrl(img.category, img.filename)}"
        src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
        alt="${escHtml(img.name)}" />
      <div class="card-body">
        <div class="card-title">${escHtml(img.name)}</div>
        <div class="card-category-label">${escHtml(img.category)}</div>
      </div>
    </div>`;
}

// ── Tabs ──
function updateCounts(results) {
  const ni = results.images.length;
  const nc = results.categories.length;
  document.getElementById('count-all').textContent       = ni + nc;
  document.getElementById('count-images').textContent    = ni;
  document.getElementById('count-categories').textContent = nc;
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-all').classList.toggle('hidden',        activeTab !== 'all');
    document.getElementById('tab-images').classList.toggle('hidden',     activeTab !== 'images');
    document.getElementById('tab-categories').classList.toggle('hidden', activeTab !== 'categories');
  });
});

// ── Inputs ──
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  searchClear.classList.toggle('hidden', !q);
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(runSearch, 250);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.add('hidden');
  runSearch();
  searchInput.focus();
});

// ── Keyboard ──
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.activeElement !== searchInput) searchInput.focus();
});

// ── Init ──
buildTagSidebar().then(() => {
  if (initQuery || activeTags.size > 0) runSearch();
});

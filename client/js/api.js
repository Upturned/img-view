// Shared API helpers — thin wrappers around fetch for every route.

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// --- Categories ---
const api = {
  getCategories: () => apiFetch('/api/categories'),
  createCategory: (name) => apiFetch('/api/categories', { method: 'POST', body: JSON.stringify({ name }) }),
  getCategoryImages: (name, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/categories/${encodeURIComponent(name)}${q ? '?' + q : ''}`);
  },

  // --- Videos ---
  getVideoCategories: () => apiFetch('/api/videos/categories'),
  createVideoCategory: (name) => apiFetch('/api/videos/categories', { method: 'POST', body: JSON.stringify({ name }) }),
  getVideos: (name, params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/videos/${encodeURIComponent(name)}${q ? '?' + q : ''}`);
  },

  // --- Tags ---
  getAllTags: () => apiFetch('/api/tags'),
  // Returns [{ tag, count }] sorted by name. Optional category scopes counts to that category.
  getUniqueTags: (category) => {
    const q = category ? '?' + new URLSearchParams({ category }) : '';
    return apiFetch(`/api/tags/all${q}`);
  },
  getImageTags: (category, filename) =>
    apiFetch(`/api/tags/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`),
  setImageTags: (category, filename, tags) =>
    apiFetch(`/api/tags/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`, {
      method: 'POST',
      body: JSON.stringify({ tags }),
    }),
  deleteImageTags: (category, filename) =>
    apiFetch(`/api/tags/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
  batchAddTag: (images, tag) =>
    apiFetch('/api/tags/batch-add', { method: 'POST', body: JSON.stringify({ images, tag }) }),

  // --- Favorites ---
  getFavorites: () => apiFetch('/api/favorites'),
  toggleFavorite: (category, filename) =>
    apiFetch(`/api/favorites/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`, { method: 'POST' }),

  // --- Recycle bin ---
  recycleImage: (category, filename) =>
    apiFetch(`/api/recycle/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`, { method: 'POST' }),
  getRecycleBin: () => apiFetch('/api/recycle'),
  deleteFromRecycleBin: (filename) =>
    apiFetch(`/api/recycle/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
  restoreFromRecycleBin: (filename) =>
    apiFetch(`/api/recycle/restore/${encodeURIComponent(filename)}`, { method: 'POST' }),

  // --- Search ---
  // tags can be a string (single) or an array of strings (multi, AND logic)
  search: (q, type = 'all', tags = []) => {
    const params = new URLSearchParams({ q, type });
    const tagList = Array.isArray(tags) ? tags.filter(Boolean) : (tags ? [tags] : []);
    if (tagList.length === 1) params.set('tag', tagList[0]);
    else if (tagList.length > 1) params.set('tags', tagList.join(','));
    return apiFetch(`/api/search?${params}`);
  },

  // --- Random ---
  getRandomVideo: (opts = {}) => {
    const params = new URLSearchParams();
    if (opts.category) params.set('category', opts.category);
    if (opts.exclude)  params.set('exclude', opts.exclude);
    const q = params.toString();
    return apiFetch(`/api/random/video${q ? '?' + q : ''}`);
  },
  getRandom: (opts = {}) => {
    const params = new URLSearchParams();
    if (opts.category) params.set('category', opts.category);
    if (opts.tag)      params.set('tag', opts.tag);
    if (opts.exclude)  params.set('exclude', opts.exclude);
    const q = params.toString();
    return apiFetch(`/api/random${q ? '?' + q : ''}`);
  },

  // --- Open With ---
  openWith: (category, filename, type = 'image') =>
    apiFetch('/api/open', { method: 'POST', body: JSON.stringify({ category, filename, type }) }),

  // --- File management ---
  moveFile: (filename, fromCategory, toCategory, type = 'image') =>
    apiFetch('/api/files/move', { method: 'POST', body: JSON.stringify({ filename, fromCategory, toCategory, type }) }),
  copyFile: (filename, fromCategory, toCategory, type = 'image') =>
    apiFetch('/api/files/copy', { method: 'POST', body: JSON.stringify({ filename, fromCategory, toCategory, type }) }),
  getLooseFiles: () => apiFetch('/api/files/loose'),
  organizeLooseFiles: () => apiFetch('/api/files/organize-loose', { method: 'POST' }),
  organizeDeep: () => apiFetch('/api/files/organize-deep', { method: 'POST' }),
  pickFile: (type, category) => apiFetch('/api/files/pick', {
    method: 'POST',
    body: JSON.stringify({ type, category }),
  }),
  renameFile: (category, oldFilename, newFilename, type = 'image') => apiFetch('/api/files/rename', {
    method: 'POST',
    body: JSON.stringify({ category, oldFilename, newFilename, type }),
  }),
  moveFiles: (files, toCategory, type = 'image') =>
    apiFetch('/api/files/move-bulk', { method: 'POST', body: JSON.stringify({ files, toCategory, type }) }),
  copyFiles: (files, toCategory, type = 'image') =>
    apiFetch('/api/files/copy-bulk', { method: 'POST', body: JSON.stringify({ files, toCategory, type }) }),
  cleanupThumbs: () => apiFetch('/api/files/cleanup-thumbs', { method: 'POST' }),
};

// --- Toast notifications ---
function showToast(message, type = 'info', duration = 3000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// --- URL helpers ---
function thumbUrl(category, filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'svg') return `/images/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`;
  return `/thumbnails/${encodeURIComponent(category)}/${encodeURIComponent(filename)}.webp`;
}

function imageUrl(category, filename) {
  return `/images/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`;
}

function videoUrl(category, filename) {
  return `/videos/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`;
}

// --- Page navigation ---
function goTo(page, params = {}) {
  const q = new URLSearchParams(params).toString();
  window.location.href = `/pages/${page}.html${q ? '?' + q : ''}`;
}

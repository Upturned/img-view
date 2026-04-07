// Custom right-click context menu system.
// Include after api.js on pages that need it.
//
// Usage:
//   contextMenu.on(element, (e) => [ ...items ])
//
// Item shapes:
//   { label: 'Do thing', action: () => {} }
//   { label: '---' }   ← separator
//   { label: 'Disabled', disabled: true }

const contextMenu = (() => {
  // ── Inject styles once ──
  const style = document.createElement('style');
  style.textContent = `
    #ctx-menu {
      position: fixed;
      z-index: 9999;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      box-shadow: var(--shadow-hover);
      padding: 0.3rem 0;
      min-width: 180px;
      max-width: 260px;
      animation: ctx-in 0.1s ease;
      user-select: none;
    }
    @keyframes ctx-in {
      from { opacity: 0; transform: scale(0.96); }
      to   { opacity: 1; transform: scale(1); }
    }
    .ctx-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.45rem 0.9rem;
      font-size: 0.875rem;
      color: var(--text-primary);
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.1s;
    }
    .ctx-item:hover { background: var(--bg-tertiary); }
    .ctx-item.disabled { color: var(--text-muted); cursor: default; pointer-events: none; }
    .ctx-item .ctx-icon { font-size: 0.8rem; width: 16px; text-align: center; flex-shrink: 0; }
    .ctx-sep {
      height: 1px;
      background: var(--border);
      margin: 0.25rem 0;
    }
  `;
  document.head.appendChild(style);

  let menuEl = null;

  function close() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
  }

  function open(x, y, items) {
    close();

    menuEl = document.createElement('div');
    menuEl.id = 'ctx-menu';
    menuEl.setAttribute('role', 'menu');

    for (const item of items) {
      if (item.label === '---') {
        const sep = document.createElement('div');
        sep.className = 'ctx-sep';
        menuEl.appendChild(sep);
        continue;
      }

      const el = document.createElement('div');
      el.className = 'ctx-item' + (item.disabled ? ' disabled' : '');
      el.setAttribute('role', 'menuitem');
      el.tabIndex = item.disabled ? -1 : 0;

      if (item.icon) {
        const icon = document.createElement('span');
        icon.className = 'ctx-icon';
        icon.textContent = item.icon;
        el.appendChild(icon);
      }

      const label = document.createElement('span');
      label.textContent = item.label;
      el.appendChild(label);

      if (!item.disabled && item.action) {
        el.addEventListener('click', () => { close(); item.action(); });
        el.addEventListener('keydown', e => { if (e.key === 'Enter') { close(); item.action(); } });
      }

      menuEl.appendChild(el);
    }

    document.body.appendChild(menuEl);

    // Position — keep inside viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mw = menuEl.offsetWidth  || 180;
    const mh = menuEl.offsetHeight || 200;

    menuEl.style.left = Math.min(x, vw - mw - 8) + 'px';
    menuEl.style.top  = Math.min(y, vh - mh - 8) + 'px';

    // Focus first item for keyboard nav
    const first = menuEl.querySelector('.ctx-item:not(.disabled)');
    if (first) first.focus();
  }

  // Close when clicking outside the menu, on scroll, or Escape
  document.addEventListener('mousedown', e => {
    if (menuEl && !menuEl.contains(e.target)) close();
  });
  document.addEventListener('scroll',  close, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  function on(element, itemsFn) {
    element.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      const items = itemsFn(e);
      if (items && items.length) open(e.clientX, e.clientY, items);
    });
  }

  return { on, open, close };
})();


// ── Category picker modal (used by Copy to / Move to) ──
const categoryPicker = (() => {
  function buildModal() {
    if (document.getElementById('cat-picker-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'cat-picker-overlay';
    overlay.className = 'modal-overlay hidden';
    overlay.innerHTML = `
      <div class="modal" style="max-height:70vh;display:flex;flex-direction:column;">
        <div class="modal-title" id="cat-picker-title">Select category</div>
        <input class="input" id="cat-picker-search" placeholder="Filter…" autocomplete="off"
               style="margin-bottom:0.75rem;flex-shrink:0;" />
        <div id="cat-picker-list"
             style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:0.3rem;"></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="cat-picker-cancel">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => { if (e.target === overlay) hide(); });
    document.getElementById('cat-picker-cancel').addEventListener('click', hide);
    document.getElementById('cat-picker-search').addEventListener('input', () => filterList());
  }

  let allCategories = [];
  let onPick = null;

  function filterList() {
    const q = document.getElementById('cat-picker-search').value.trim().toLowerCase();
    const filtered = q ? allCategories.filter(c => c.name.toLowerCase().includes(q)) : allCategories;
    renderList(filtered);
  }

  function renderList(cats) {
    const list = document.getElementById('cat-picker-list');
    list.innerHTML = cats.map(c => `
      <button class="btn btn-ghost" data-name="${escHtml(c.name)}"
              style="justify-content:flex-start;text-align:left;">
        ${escHtml(c.name)}
      </button>`).join('');

    list.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        hide();
        if (onPick) onPick(btn.dataset.name);
      });
    });
  }

  function show(title, categories, callback) {
    buildModal();
    allCategories = categories;
    onPick = callback;
    document.getElementById('cat-picker-title').textContent = title;
    document.getElementById('cat-picker-search').value = '';
    renderList(categories);
    document.getElementById('cat-picker-overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('cat-picker-search').focus(), 50);
  }

  function hide() {
    const overlay = document.getElementById('cat-picker-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { show };
})();


// ── Shared action helpers (used by multiple pages) ──

// Opens the Windows file picker and adds the chosen file to a category.
// onAdded(filename) is called if a file was successfully added.
async function ctxAddFile(type, category, onAdded) {
  showToast('Opening file picker…', 'info', 1500);
  try {
    const result = await api.pickFile(type, category);
    if (result.cancelled) return;
    showToast(`Added "${result.filename}" to "${category}".`, 'success');
    if (onAdded) onAdded(result.filename);
  } catch (err) {
    showToast('Failed to add file: ' + err.message, 'error');
  }
}

async function ctxCopyTo(category, filename) {
  try {
    const categories = await api.getCategories();
    categoryPicker.show(
      `Copy "${filename}" to…`,
      categories.filter(c => c.name !== category),
      async (dest) => {
        try {
          await api.copyFile(filename, category, dest, 'image');
          showToast(`Copied to "${dest}".`, 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    );
  } catch (err) {
    showToast('Failed to load categories: ' + err.message, 'error');
  }
}

async function ctxMoveTo(category, filename, onMoved) {
  try {
    const categories = await api.getCategories();
    categoryPicker.show(
      `Move "${filename}" to…`,
      categories.filter(c => c.name !== category),
      async (dest) => {
        try {
          await api.moveFile(filename, category, dest, 'image');
          showToast(`Moved to "${dest}".`, 'success');
          if (onMoved) onMoved();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    );
  } catch (err) {
    showToast('Failed to load categories: ' + err.message, 'error');
  }
}

//Prompts to new name
// onRenamed(newFilename) is called on success.
async function ctxRename(category, filename, type = 'image', onRenamed) {
  const ext     = filename.slice(filename.lastIndexOf('.'));      // e.g. ".jpg"
  const current = filename.slice(0, filename.lastIndexOf('.'));   // name without ext

  const newName = prompt(`Rename "${filename}"\n\nNew name (without extension):`, current);
  if (!newName || newName.trim() === current) return;            // cancelled or unchanged

  const newFilename = newName.trim() + ext;

  try {
    await api.renameFile(category, filename, newFilename, type);
    showToast(`Renamed to "${newFilename}".`, 'success');
    if (onRenamed) onRenamed(newFilename);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

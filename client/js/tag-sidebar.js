// Reusable tag sidebar component.
// Requires sidebar HTML to be present in the page (same structure as in home.html).
// Usage:
//   const sidebar = createTagSidebar({ type: 'image', onFilterChange: (filter) => {} });
//   sidebar.init();
// filter shape: { include: string[], exclude: string[], require: string[] }
//   include = any of these tags (OR)
//   exclude = none of these tags
//   require = all of these tags (AND)

function createTagSidebar({ type = 'image', onFilterChange }) {
  let allTagsData = [];
  let tagStates   = new Map();  // tag → 'include' | 'exclude' | 'require'
  let sortMode    = 'name';
  let searchQuery = '';

  const CYCLE  = { 'include': 'exclude', 'exclude': 'require', 'require': '' };
  const SYMBOL = { 'include': '+', 'exclude': '−', 'require': '✓' };

  function _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _buildFilter() {
    const include = [], exclude = [], require = [];
    for (const [tag, state] of tagStates) {
      if (state === 'include') include.push(tag);
      else if (state === 'exclude') exclude.push(tag);
      else if (state === 'require') require.push(tag);
    }
    return { include, exclude, require };
  }

  async function reload() {
    try {
      allTagsData = await api.getUniqueTags(undefined, type);
    } catch {
      allTagsData = [];
    }
    render();
  }

  function render() {
    const list     = document.getElementById('tag-sidebar-list');
    const clearBtn = document.getElementById('btn-clear-tags');
    if (!list) return;

    let items = [...allTagsData];
    if (searchQuery) items = items.filter(({ tag }) => tag.includes(searchQuery));

    if (sortMode === 'count') {
      items.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    } else {
      items.sort((a, b) => a.tag.localeCompare(b.tag));
    }

    if (items.length === 0) {
      list.innerHTML = '<span class="tag-sidebar-empty">No tags yet.</span>';
      clearBtn?.classList.add('hidden');
      return;
    }

    list.innerHTML = items.map(({ tag, count }) => {
      const state  = tagStates.get(tag) || '';
      const symbol = SYMBOL[state] || '';
      return `<button class="tag-chip${state ? ' ' + state : ''}" data-tag="${_esc(tag)}">
        ${symbol ? `<span class="tag-chip-state">${symbol}</span>` : ''}
        <span class="tag-chip-label">${_esc(tag)}</span>
        <span class="tag-count">${count}</span>
        ${state ? `<span class="tag-chip-clear" title="Remove">✕</span>` : ''}
      </button>`;
    }).join('');

    list.querySelectorAll('.tag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const tag  = chip.dataset.tag;
        const curr = tagStates.get(tag) || '';
        const next = curr === '' ? 'include' : CYCLE[curr];
        if (next) tagStates.set(tag, next);
        else tagStates.delete(tag);
        render();
        clearBtn?.classList.toggle('hidden', tagStates.size === 0);
        onFilterChange(_buildFilter());
      });
      chip.querySelector('.tag-chip-clear')?.addEventListener('click', (e) => {
        e.stopPropagation();
        tagStates.delete(chip.dataset.tag);
        render();
        clearBtn?.classList.toggle('hidden', tagStates.size === 0);
        onFilterChange(_buildFilter());
      });
    });

    clearBtn?.classList.toggle('hidden', tagStates.size === 0);
  }

  function clear() {
    tagStates.clear();
    render();
    document.getElementById('btn-clear-tags')?.classList.add('hidden');
    onFilterChange({ include: [], exclude: [], require: [] });
  }

  function init() {
    document.getElementById('tag-sidebar-search')?.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      render();
    });
    document.getElementById('tag-sort-name')?.addEventListener('click', () => {
      sortMode = 'name';
      document.getElementById('tag-sort-name')?.classList.add('active');
      document.getElementById('tag-sort-count')?.classList.remove('active');
      render();
    });
    document.getElementById('tag-sort-count')?.addEventListener('click', () => {
      sortMode = 'count';
      document.getElementById('tag-sort-count')?.classList.add('active');
      document.getElementById('tag-sort-name')?.classList.remove('active');
      render();
    });
    document.getElementById('btn-clear-tags')?.addEventListener('click', clear);
    reload();
  }

  return { init, clear, reload, getFilter: _buildFilter };
}

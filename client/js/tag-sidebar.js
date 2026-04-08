// Reusable tag sidebar component.
// Requires sidebar HTML to be present in the page (same structure as in home.html).
// Usage:
//   const sidebar = createTagSidebar({ type: 'image', onFilterChange: (activeTags) => {} });
//   sidebar.init();

function createTagSidebar({ type = 'image', onFilterChange }) {
  let allTagsData = [];
  let activeTags  = new Set();
  let sortMode    = 'name';
  let searchQuery = '';

  function _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

    list.innerHTML = items.map(({ tag, count }) =>
      `<button class="tag-chip${activeTags.has(tag) ? ' active' : ''}" data-tag="${_esc(tag)}">
        <span class="tag-chip-label">${_esc(tag)}</span>
        <span class="tag-count">${count}</span>
      </button>`
    ).join('');

    list.querySelectorAll('.tag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const tag = chip.dataset.tag;
        if (activeTags.has(tag)) activeTags.delete(tag);
        else activeTags.add(tag);
        chip.classList.toggle('active', activeTags.has(tag));
        clearBtn?.classList.toggle('hidden', activeTags.size === 0);
        onFilterChange([...activeTags]);
      });
    });

    clearBtn?.classList.toggle('hidden', activeTags.size === 0);
  }

  function clear() {
    activeTags.clear();
    document.querySelectorAll('#tag-sidebar-list .tag-chip').forEach(chip => chip.classList.remove('active'));
    document.getElementById('btn-clear-tags')?.classList.add('hidden');
    onFilterChange([]);
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

  return { init, clear, reload, getActiveTags: () => [...activeTags] };
}

// Shared navbar utilities — Organize button, included on every page after api.js.

// Organize button — deep organize (misplaced files inside category subfolders)
// followed by loose-file organize (files in root of images/ or videos/)
document.getElementById('btn-nav-organize')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-nav-organize');
  btn.disabled = true;
  btn.textContent = 'Organizing…';

  try {
    const [deep, loose] = await Promise.all([
      api.organizeDeep(),
      api.organizeLooseFiles(),
    ]);

    const total = deep.moved.length + loose.moved.length;
    if (total === 0) {
      showToast('Everything is already organized.', 'info');
    } else {
      showToast(`Organized ${total} file${total !== 1 ? 's' : ''}.`, 'success');
      setTimeout(() => location.reload(), 800);
    }
  } catch (err) {
    showToast('Organize failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Organize';
  }
});

// Shared navbar utilities — Organize button and Images/Videos navigation.
// Include this after api.js on every page.

// Highlight the active section button
(function markActive() {
  const path = location.pathname;
  const isVideos = path.includes('video');
  document.getElementById('btn-nav-images')?.classList.toggle('active', !isVideos);
  document.getElementById('btn-nav-videos')?.classList.toggle('active', isVideos);
})();

// Images button
document.getElementById('btn-nav-images')?.addEventListener('click', () => {
  goTo('home');
});

// Videos button
document.getElementById('btn-nav-videos')?.addEventListener('click', () => {
  goTo('videos');
});

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
      // Reload the page so grids reflect the changes
      setTimeout(() => location.reload(), 800);
    }
  } catch (err) {
    showToast('Organize failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Organize';
  }
});

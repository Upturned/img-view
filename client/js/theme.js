// Theme switching — loaded by every page before base.css
// Reads from localStorage and injects the right theme link tag.

const THEMES = {
  minimal: '/css/theme-minimal.css',
  modern:  '/css/theme-modern.css',
  warm:  '/css/theme-warm.css',
  highcontrast:  '/css/theme-highcontrast.css',
};

const DEFAULT_THEME = 'minimal';

function getTheme() {
  return localStorage.getItem('theme') || DEFAULT_THEME;
}

function setTheme(name) {
  if (!THEMES[name]) return;
  localStorage.setItem('theme', name);
  const link = document.getElementById('theme-link');
  if (link) link.href = THEMES[name];
}

function toggleTheme() {
  const keys = Object.keys(THEMES);
  const idx = keys.indexOf(getTheme());
  const next = keys[(idx + 1) % keys.length];
  setTheme(next);
  updateToggleBtn();
}

function updateToggleBtn() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  btn.title = `Current theme: ${getTheme()}`;
}

// Apply theme immediately on load (avoids flash)
(function () {
  const link = document.getElementById('theme-link');
  if (link) link.href = THEMES[getTheme()];
})();

document.addEventListener('DOMContentLoaded', updateToggleBtn);

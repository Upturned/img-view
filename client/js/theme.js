// Theme switching — loaded by every page before base.css
// Reads from localStorage and injects the right theme link tag.

const THEMES = {
  minimal: '/css/theme-minimal.css',
  modern:  '/css/theme-modern.css',
};

const DEFAULT_THEME = 'modern';

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
  const current = getTheme();
  const next = current === 'minimal' ? 'modern' : 'minimal';
  setTheme(next);
  updateToggleBtn();
}

function updateToggleBtn() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  const current = getTheme();
  btn.title = current === 'minimal' ? 'Switch to Modern theme' : 'Switch to Minimal theme';
  btn.textContent = current === 'minimal' ? '✦' : '◈';
}

// Apply theme immediately on load (avoids flash)
(function () {
  const link = document.getElementById('theme-link');
  if (link) link.href = THEMES[getTheme()];
})();

document.addEventListener('DOMContentLoaded', updateToggleBtn);

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const FAVORITES_PATH = path.join(__dirname, '../../data/favorites.json');

function loadFavorites() {
  try { return JSON.parse(fs.readFileSync(FAVORITES_PATH, 'utf8')); } catch { return {}; }
}

function saveFavorites(data) {
  fs.writeFileSync(FAVORITES_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// GET /api/favorites
// Returns full favorites map: { "category/filename": true }
router.get('/', (req, res) => {
  res.json(loadFavorites());
});

// POST /api/favorites/:category/:filename
// Toggles favorite state. Returns { favorited: bool }
router.post('/:category/:filename', (req, res) => {
  const key = `${req.params.category}/${req.params.filename}`;
  const data = loadFavorites();
  const favorited = !data[key];
  if (favorited) data[key] = true;
  else delete data[key];
  saveFavorites(data);
  res.json({ favorited });
});

module.exports = router;

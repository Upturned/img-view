const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { thumbPath } = require('../utils/thumbnails');
const scanner = require('../utils/scanner');

const IMAGES_DIR = scanner.getImagesDir();
const RECYCLE_DIR = path.join(IMAGES_DIR, 'recycle-bin');
const FAVORITES_PATH = path.join(__dirname, '../../data/favorites.json');

function loadFavorites() {
  try { return JSON.parse(fs.readFileSync(FAVORITES_PATH, 'utf8')); } catch { return {}; }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function uniqueDest(destPath) {
  if (!fs.existsSync(destPath)) return destPath;
  const ext = path.extname(destPath);
  const base = destPath.slice(0, -ext.length);
  let i = 1;
  let candidate;
  do { candidate = `${base} (${i++})${ext}`; } while (fs.existsSync(candidate));
  return candidate;
}

// POST /api/recycle/restore/:filename — must be declared before /:category/:filename
// Moves a file from the recycle bin back to loose-images/
router.post('/restore/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const src = path.join(RECYCLE_DIR, filename);
  if (!fs.existsSync(src)) return res.status(404).json({ error: 'File not found in recycle bin.' });

  const looseDir = path.join(IMAGES_DIR, 'loose-images');
  ensureDir(looseDir);
  const dest = uniqueDest(path.join(looseDir, filename));

  try {
    fs.renameSync(src, dest);
    res.json({ message: 'Restored to loose-images.', filename: path.basename(dest) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recycle/:category/:filename
// Moves an image to the recycle bin. Rejects if the image is favorited.
router.post('/:category/:filename', (req, res) => {
  const { category, filename } = req.params;
  const key = `${category}/${filename}`;

  const favorites = loadFavorites();
  if (favorites[key]) {
    return res.status(409).json({ error: 'Cannot recycle a favorited image. Remove the favorite first.' });
  }

  const src = path.join(IMAGES_DIR, category, filename);
  if (!fs.existsSync(src)) return res.status(404).json({ error: 'File not found.' });

  ensureDir(RECYCLE_DIR);
  const dest = uniqueDest(path.join(RECYCLE_DIR, path.basename(filename)));

  try {
    fs.renameSync(src, dest);

    // Remove thumbnail — recycled images don't need it
    const oldThumb = thumbPath(category, filename);
    if (fs.existsSync(oldThumb)) {
      try { fs.unlinkSync(oldThumb); } catch { /* non-critical */ }
    }

    res.json({ message: 'Moved to recycle bin.', filename: path.basename(dest) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recycle
// Returns list of files in the recycle bin
router.get('/', (req, res) => {
  ensureDir(RECYCLE_DIR);
  try {
    const files = fs.readdirSync(RECYCLE_DIR)
      .filter(f => {
        const p = path.join(RECYCLE_DIR, f);
        return !fs.statSync(p).isDirectory() && scanner.isImage(f);
      })
      .map(f => {
        const stats = fs.statSync(path.join(RECYCLE_DIR, f));
        return { filename: f, size: stats.size, modified: stats.mtimeMs };
      })
      .sort((a, b) => b.modified - a.modified);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/recycle/:filename
// Permanently deletes a file from the recycle bin
router.delete('/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(RECYCLE_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found.' });
  try {
    fs.unlinkSync(filePath);
    res.json({ message: 'Permanently deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

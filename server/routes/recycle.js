const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { thumbPath } = require('../utils/thumbnails');
const scanner = require('../utils/scanner');

const IMAGES_DIR = scanner.getImagesDir();
const VIDEOS_DIR = scanner.getVideosDir();
const IMAGE_RECYCLE_DIR = path.join(IMAGES_DIR, 'recycle-bin');
const VIDEO_RECYCLE_DIR = path.join(VIDEOS_DIR, 'recycle-bin');
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
router.post('/restore/:filename', (req, res) => {
  const type = req.query.type === 'video' ? 'video' : 'image';
  const filename = path.basename(req.params.filename);
  const recycleDir = type === 'video' ? VIDEO_RECYCLE_DIR : IMAGE_RECYCLE_DIR;
  const src = path.join(recycleDir, filename);
  if (!fs.existsSync(src)) return res.status(404).json({ error: 'File not found in recycle bin.' });

  const looseDir = type === 'video'
    ? path.join(VIDEOS_DIR, 'loose-videos')
    : path.join(IMAGES_DIR, 'loose-images');
  ensureDir(looseDir);
  const dest = uniqueDest(path.join(looseDir, filename));

  try {
    fs.renameSync(src, dest);
    const target = type === 'video' ? 'loose-videos' : 'loose-images';
    res.json({ message: `Restored to ${target}.`, filename: path.basename(dest) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recycle/:category/:filename
router.post('/:category/:filename', (req, res) => {
  const type = req.query.type === 'video' ? 'video' : 'image';
  const { category, filename } = req.params;
  const key = `${category}/${filename}`;

  // Only check favorites for images (videos don't have favorites yet)
  if (type === 'image') {
    const favorites = loadFavorites();
    if (favorites[key]) {
      return res.status(409).json({ error: 'Cannot recycle a favorited image. Remove the favorite first.' });
    }
  }

  const sourceDir  = type === 'video' ? VIDEOS_DIR : IMAGES_DIR;
  const recycleDir = type === 'video' ? VIDEO_RECYCLE_DIR : IMAGE_RECYCLE_DIR;
  const src = path.join(sourceDir, category, filename);

  if (!fs.existsSync(src)) return res.status(404).json({ error: 'File not found.' });

  ensureDir(recycleDir);
  const dest = uniqueDest(path.join(recycleDir, path.basename(filename)));

  try {
    fs.renameSync(src, dest);

    // Remove thumbnail for images only
    if (type === 'image') {
      const oldThumb = thumbPath(category, filename);
      if (fs.existsSync(oldThumb)) {
        try { fs.unlinkSync(oldThumb); } catch { /* non-critical */ }
      }
    }

    res.json({ message: 'Moved to recycle bin.', filename: path.basename(dest) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recycle
router.get('/', (req, res) => {
  const type = req.query.type === 'video' ? 'video' : 'image';
  const recycleDir = type === 'video' ? VIDEO_RECYCLE_DIR : IMAGE_RECYCLE_DIR;
  const isValid = type === 'video' ? scanner.isVideo : scanner.isImage;
  ensureDir(recycleDir);
  try {
    const files = fs.readdirSync(recycleDir)
      .filter(f => {
        const p = path.join(recycleDir, f);
        return !fs.statSync(p).isDirectory() && isValid(f);
      })
      .map(f => {
        const stats = fs.statSync(path.join(recycleDir, f));
        return { filename: f, size: stats.size, modified: stats.mtimeMs };
      })
      .sort((a, b) => b.modified - a.modified);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/recycle/:filename
router.delete('/:filename', (req, res) => {
  const type = req.query.type === 'video' ? 'video' : 'image';
  const filename = path.basename(req.params.filename);
  const recycleDir = type === 'video' ? VIDEO_RECYCLE_DIR : IMAGE_RECYCLE_DIR;
  const filePath = path.join(recycleDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found.' });
  try {
    fs.unlinkSync(filePath);
    res.json({ message: 'Permanently deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

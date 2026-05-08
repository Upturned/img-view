const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { thumbPath } = require('../utils/thumbnails');
const scanner = require('../utils/scanner');
const { db } = require('../utils/db');

const IMAGES_DIR = scanner.getImagesDir();
const VIDEOS_DIR = scanner.getVideosDir();
const AUDIO_DIR  = scanner.getAudioDir();

const IMAGE_RECYCLE_DIR = path.join(IMAGES_DIR, 'recycle-bin');
const VIDEO_RECYCLE_DIR = path.join(VIDEOS_DIR, 'recycle-bin');
const AUDIO_RECYCLE_DIR = path.join(AUDIO_DIR,  'recycle-bin');

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseType(q) {
  if (q === 'video') return 'video';
  if (q === 'audio') return 'audio';
  return 'image';
}

function getDirs(type) {
  if (type === 'video') return { sourceDir: VIDEOS_DIR, recycleDir: VIDEO_RECYCLE_DIR };
  if (type === 'audio') return { sourceDir: AUDIO_DIR,  recycleDir: AUDIO_RECYCLE_DIR };
  return { sourceDir: IMAGES_DIR, recycleDir: IMAGE_RECYCLE_DIR };
}

function getLooseDir(type) {
  if (type === 'video') return path.join(VIDEOS_DIR, 'loose-videos');
  if (type === 'audio') return path.join(AUDIO_DIR,  'loose-audio');
  return path.join(IMAGES_DIR, 'loose-images');
}

function isValidFile(type) {
  if (type === 'video') return scanner.isVideo;
  if (type === 'audio') return scanner.isAudio;
  return scanner.isImage;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function uniqueDest(destPath) {
  if (!fs.existsSync(destPath)) return destPath;
  const ext  = path.extname(destPath);
  const base = destPath.slice(0, -ext.length);
  let i = 1;
  let candidate;
  do { candidate = `${base} (${i++})${ext}`; } while (fs.existsSync(candidate));
  return candidate;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// POST /api/recycle/restore/:filename — must be before /:category/:filename
router.post('/restore/:filename', (req, res) => {
  const type      = parseType(req.query.type);
  const filename  = path.basename(req.params.filename);
  const { recycleDir } = getDirs(type);
  const src = path.join(recycleDir, filename);
  if (!fs.existsSync(src)) return res.status(404).json({ error: 'File not found in recycle bin.' });

  const looseDir = getLooseDir(type);
  ensureDir(looseDir);
  const dest = uniqueDest(path.join(looseDir, filename));

  try {
    fs.renameSync(src, dest);
    const target = { video: 'loose-videos', audio: 'loose-audio', image: 'loose-images' }[type];
    res.json({ message: `Restored to ${target}.`, filename: path.basename(dest) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recycle/:category/:filename
router.post('/:category/:filename', (req, res) => {
  const type     = parseType(req.query.type);
  const { category, filename } = req.params;

  // Block recycling if the file is favorited
  const fileRow = db.prepare('SELECT favorited FROM files WHERE type = ? AND category = ? AND filename = ?')
                    .get(type, category, filename);
  if (fileRow?.favorited) {
    return res.status(409).json({ error: 'Cannot recycle a favorited file. Remove the favorite first.' });
  }

  const { sourceDir, recycleDir } = getDirs(type);
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
  const type = parseType(req.query.type);
  const { recycleDir } = getDirs(type);
  const isValid = isValidFile(type);
  ensureDir(recycleDir);
  try {
    const files = fs.readdirSync(recycleDir)
      .filter(f => !fs.statSync(path.join(recycleDir, f)).isDirectory() && isValid(f))
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
  const type = parseType(req.query.type);
  const filename  = path.basename(req.params.filename);
  const { recycleDir } = getDirs(type);
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

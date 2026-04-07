const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const scanner = require('../utils/scanner');

const TAGS_PATH = path.join(__dirname, '../../data/tags.json');

function loadTags() {
  try {
    return JSON.parse(fs.readFileSync(TAGS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// GET /api/random
// Returns one random image.
// Query params:
//   category = restrict to a specific category
//   tag      = restrict to images with a specific tag
//   exclude  = category/filename to exclude (avoids returning the same image twice)
router.get('/', (req, res) => {
  const { category, tag, exclude } = req.query;
  const tagsData = loadTags();

  let pool = category
    ? (scanner.scanCategory(category) || [])
    : scanner.scanAllImages();

  if (pool.length === 0) {
    return res.status(404).json({ error: 'No images found.' });
  }

  if (tag) {
    pool = pool.filter(img => {
      const key = `${img.category}/${img.filename}`;
      return (tagsData[key] || []).includes(tag.toLowerCase());
    });
  }

  if (exclude) {
    pool = pool.filter(img => `${img.category}/${img.filename}` !== exclude);
  }

  if (pool.length === 0) {
    return res.status(404).json({ error: 'No images match the given filters.' });
  }

  res.json(pick(pool));
});

// GET /api/random/video
// Returns one random video.
// Query params:
//   category = restrict to a specific video category
//   exclude  = category/filename to exclude
router.get('/video', (req, res) => {
  const { category, exclude } = req.query;

  let pool;
  if (category) {
    pool = scanner.scanVideoCategory(category) || [];
  } else {
    // Collect all videos across every category
    const cats = scanner.scanVideoCategories();
    pool = cats.flatMap(cat => scanner.scanVideoCategory(cat.name) || []);
  }

  if (exclude) {
    pool = pool.filter(v => `${v.category}/${v.filename}` !== exclude);
  }

  if (pool.length === 0) {
    return res.status(404).json({ error: 'No videos found.' });
  }

  res.json(pick(pool));
});

module.exports = router;

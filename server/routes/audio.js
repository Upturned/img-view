const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const scanner = require('../utils/scanner');

// GET /api/audio/categories
router.get('/categories', (req, res) => {
  try {
    res.json(scanner.scanAudioCategories());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/audio/categories
// Body: { name: string }
router.post('/categories', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Category name is required.' });
  }
  const safeName = name.trim().replace(/[<>:"/\\|?*]/g, '_');
  if (!safeName) return res.status(400).json({ error: 'Invalid category name.' });

  const categoryPath = path.join(scanner.getAudioDir(), safeName);
  if (fs.existsSync(categoryPath)) return res.status(409).json({ error: 'Category already exists.' });

  try {
    fs.mkdirSync(categoryPath, { recursive: true });
    res.status(201).json({ name: safeName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audio/random — random track across all categories or within one
// ?category= ?exclude=
router.get('/random', (req, res) => {
  const { category, exclude } = req.query;
  try {
    let tracks = category
      ? (scanner.scanAudioCategory(category) || [])
      : scanner.scanAllAudio();
    if (exclude) tracks = tracks.filter(t => t.filename !== exclude);
    if (tracks.length === 0) return res.status(404).json({ error: 'No tracks available.' });
    res.json(tracks[Math.floor(Math.random() * tracks.length)]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audio/:name — tracks in a category
// ?sort=name|modified  ?order=asc|desc  (default: name asc)
router.get('/:name', (req, res) => {
  const { name } = req.params;
  const { sort = 'name', order = 'asc' } = req.query;

  const tracks = scanner.scanAudioCategory(name);
  if (tracks === null) return res.status(404).json({ error: 'Audio category not found.' });

  const result = [...tracks];
  if (sort === 'modified') result.sort((a, b) => a.modified - b.modified);
  else result.sort((a, b) => a.filename.localeCompare(b.filename));
  if (order === 'desc') result.reverse();

  res.json(result);
});

module.exports = router;

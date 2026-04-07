const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const scanner = require('../utils/scanner');

// GET /api/videos/categories
// Returns all video categories with video count
router.get('/categories', (req, res) => {
  try {
    const categories = scanner.scanVideoCategories();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/videos/categories
// Creates a new video category
// Body: { name: string }
router.post('/categories', (req, res) => {
  const { name } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Category name is required.' });
  }

  const safeName = name.trim().replace(/[<>:"/\\|?*]/g, '_');
  if (!safeName) {
    return res.status(400).json({ error: 'Invalid category name.' });
  }

  const categoryPath = path.join(scanner.getVideosDir(), safeName);

  if (fs.existsSync(categoryPath)) {
    return res.status(409).json({ error: 'Category already exists.' });
  }

  try {
    fs.mkdirSync(categoryPath, { recursive: true });
    res.status(201).json({ name: safeName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/videos/:name
// Returns videos in a category
// Query params:
//   sort  = name | modified  (default: name)
//   order = asc | desc       (default: asc)
router.get('/:name', (req, res) => {
  const { name } = req.params;
  const { sort = 'name', order = 'asc' } = req.query;

  const videos = scanner.scanVideoCategory(name);
  if (videos === null) {
    return res.status(404).json({ error: 'Video category not found.' });
  }

  const result = [...videos];

  if (sort === 'modified') {
    result.sort((a, b) => a.modified - b.modified);
  } else {
    result.sort((a, b) => a.filename.localeCompare(b.filename));
  }

  if (order === 'desc') result.reverse();

  res.json(result);
});

module.exports = router;

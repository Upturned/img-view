const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const scanner = require('../utils/scanner');
const { generateCategoryThumbs } = require('../utils/thumbnails');

// GET /api/categories
// Returns all image categories with cover image and count
router.get('/', (req, res) => {
  try {
    const categories = scanner.scanCategories();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/categories
// Creates a new image category (subfolder inside /images)
// Body: { name: string }
router.post('/', (req, res) => {
  const { name } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Category name is required.' });
  }

  const safeName = name.trim().replace(/[<>:"/\\|?*]/g, '_');
  if (!safeName) {
    return res.status(400).json({ error: 'Invalid category name.' });
  }

  const categoryPath = path.join(scanner.getImagesDir(), safeName);

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

// GET /api/categories/:name
// Returns images in a category, with optional sort and tag filter
// Query params:
//   sort   = name | modified | random   (default: name)
//   order  = asc | desc                 (default: asc, ignored when sort=random)
//   tag    = string                     (filter by tag)
router.get('/:name', (req, res) => {
  const { name } = req.params;
  const { sort = 'name', order = 'asc', tag } = req.query;

  const images = scanner.scanCategory(name);
  if (images === null) {
    return res.status(404).json({ error: 'Category not found.' });
  }

  let result = images;

  // Tag filter
  if (tag) {
    const tagsData = loadTags();
    result = result.filter(img => {
      const key = `${img.category}/${img.filename}`;
      const tags = tagsData[key] || [];
      return tags.includes(tag);
    });
  }

  // Sort
  if (sort === 'random') {
    result = shuffled(result);
  } else if (sort === 'modified') {
    result.sort((a, b) => a.modified - b.modified);
    if (order === 'desc') result.reverse();
  } else {
    // default: name
    result.sort((a, b) => a.filename.localeCompare(b.filename));
    if (order === 'desc') result.reverse();
  }

  res.json(result);
});

// POST /api/categories/:name/thumbnails
// Triggers thumbnail generation for a specific category (background)
router.post('/:name/thumbnails', (req, res) => {
  const { name } = req.params;
  generateCategoryThumbs(name).catch(err =>
    console.error('[thumbnails] Error generating category thumbs:', err.message)
  );
  res.json({ message: `Thumbnail generation started for "${name}".` });
});

function loadTags() {
  const tagsPath = path.join(__dirname, '../../data/tags.json');
  try {
    return JSON.parse(fs.readFileSync(tagsPath, 'utf8'));
  } catch {
    return {};
  }
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = router;

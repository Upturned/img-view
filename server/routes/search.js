const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const scanner = require('../utils/scanner');

const TAGS_IMAGES_PATH = path.join(__dirname, '../../data/tags-images.json');

function loadTags() {
  try {
    return JSON.parse(fs.readFileSync(TAGS_IMAGES_PATH, 'utf8'));
  } catch {
    return {};
  }
}

// GET /api/search
// Query params:
//   q     = search string (matched against filename and category name)
//   tag   = exact tag match
//   type  = 'images' | 'categories' | 'all'  (default: all)
//
// Returns: { images: [...], categories: [...] }
router.get('/', (req, res) => {
  const { q = '', tag, tags: tagsParam, type = 'all' } = req.query;
  const query = q.trim().toLowerCase();
  const tagsData = loadTags();

  // Resolve active tags: ?tags=a,b,c (multi) OR legacy ?tag=a (single)
  const activeTags = tagsParam
    ? tagsParam.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    : tag ? [tag.trim().toLowerCase()] : [];

  const result = { images: [], categories: [] };

  if (type === 'all' || type === 'images') {
    let images = scanner.scanAllImages();

    if (query) {
      images = images.filter(img =>
        img.filename.toLowerCase().includes(query) ||
        img.category.toLowerCase().includes(query)
      );
    }

    if (activeTags.length > 0) {
      images = images.filter(img => {
        const key = `${img.category}/${img.filename}`;
        const imgTags = tagsData[key] || [];
        return activeTags.every(t => imgTags.includes(t));
      });
    }

    result.images = images;
  }

  if (type === 'all' || type === 'categories') {
    let categories = scanner.scanCategories();

    if (query) {
      categories = categories.filter(cat =>
        cat.name.toLowerCase().includes(query)
      );
    }

    // Tag filter on categories: include category if any image in it has ALL active tags
    if (activeTags.length > 0) {
      categories = categories.filter(cat => {
        const images = scanner.scanCategory(cat.name) || [];
        return images.some(img => {
          const key = `${img.category}/${img.filename}`;
          const imgTags = tagsData[key] || [];
          return activeTags.every(t => imgTags.includes(t));
        });
      });
    }

    result.categories = categories;
  }

  res.json(result);
});

module.exports = router;

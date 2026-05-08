const express = require('express');
const router = express.Router();
const scanner = require('../utils/scanner');
const { db } = require('../utils/db');

function loadTags(type = 'image') {
  const rows = db.prepare(`
    SELECT f.category, f.filename, t.name
    FROM file_tags ft
    JOIN files f ON f.id = ft.file_id
    JOIN tags  t ON t.id = ft.tag_id
    WHERE f.type = ?
  `).all(type);

  const map = {};
  for (const { category, filename, name } of rows) {
    const key = `${category}/${filename}`;
    if (!map[key]) map[key] = [];
    map[key].push(name);
  }
  return map;
}

// GET /api/search
// Query params:
//   q       = text search (filename / category name)
//   include = comma-separated tags (OR — at least one must match)
//   exclude = comma-separated tags (none may match)
//   require = comma-separated tags (AND — all must match)
//   type    = 'images' | 'categories' | 'all'  (default: all)
// Returns: { images: [...], categories: [...] }
router.get('/', (req, res) => {
  const { q = '', type = 'all' } = req.query;
  const query = q.trim().toLowerCase();
  const tagsData = loadTags('image');

  function parseList(val) {
    return val ? val.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];
  }
  const requireTags = parseList(req.query.require);
  const includeTags = parseList(req.query.include);
  const excludeTags = parseList(req.query.exclude);
  const hasTagFilter = requireTags.length > 0 || includeTags.length > 0 || excludeTags.length > 0;

  function matchesTags(imgTags) {
    if (requireTags.length > 0 && !requireTags.every(t => imgTags.includes(t))) return false;
    if (includeTags.length > 0 && !includeTags.some(t => imgTags.includes(t))) return false;
    if (excludeTags.length > 0 &&  excludeTags.some(t => imgTags.includes(t))) return false;
    return true;
  }

  const result = { images: [], categories: [] };

  if (type === 'all' || type === 'images') {
    let images = scanner.scanAllImages();
    if (query) {
      images = images.filter(img =>
        img.filename.toLowerCase().includes(query) ||
        img.category.toLowerCase().includes(query)
      );
    }
    if (hasTagFilter) {
      images = images.filter(img => matchesTags(tagsData[`${img.category}/${img.filename}`] || []));
    }
    result.images = images;
  }

  if (type === 'all' || type === 'categories') {
    let categories = scanner.scanCategories();
    if (query) {
      categories = categories.filter(cat => cat.name.toLowerCase().includes(query));
    }
    if (hasTagFilter) {
      categories = categories.filter(cat => {
        const images = scanner.scanCategory(cat.name) || [];
        return images.some(img => matchesTags(tagsData[`${img.category}/${img.filename}`] || []));
      });
    }
    result.categories = categories;
  }

  res.json(result);
});

module.exports = router;

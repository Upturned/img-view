const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const TAGS_PATH = path.join(__dirname, '../../data/tags.json');

function loadTags() {
  try {
    return JSON.parse(fs.readFileSync(TAGS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveTags(data) {
  fs.writeFileSync(TAGS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// GET /api/tags
// Returns the full tags map: { "category/filename": ["tag1", "tag2"] }
router.get('/', (req, res) => {
  res.json(loadTags());
});

// GET /api/tags/all
// Returns sorted tag list with image counts: [{ tag, count }, ...]
// Optional ?category= to scope counts to a specific category
router.get('/all', (req, res) => {
  const { category } = req.query;
  const data = loadTags();
  const counts = {};
  for (const [key, tags] of Object.entries(data)) {
    if (category && !key.startsWith(category + '/')) continue;
    for (const tag of tags) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  const result = Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
  res.json(result);
});

// POST /api/tags/batch-add
// Adds a single tag to multiple images (non-destructive: existing tags are kept)
// Body: { images: [{category, filename}], tag: string }
router.post('/batch-add', (req, res) => {
  const { images, tag } = req.body;

  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: '"images" must be a non-empty array.' });
  }
  if (!tag || typeof tag !== 'string' || !tag.trim()) {
    return res.status(400).json({ error: '"tag" is required.' });
  }

  const normalized = tag.trim().toLowerCase();
  const data = loadTags();
  let added = 0;

  for (const { category, filename } of images) {
    if (!category || !filename) continue;
    const key = `${category}/${filename}`;
    const existing = data[key] || [];
    if (!existing.includes(normalized)) {
      data[key] = [...existing, normalized];
      added++;
    }
  }

  saveTags(data);
  res.json({ message: `Added tag "${normalized}" to ${added} image(s).`, added });
});

// GET /api/tags/:category/:filename
// Returns tags for a specific image
router.get('/:category/:filename', (req, res) => {
  const { category, filename } = req.params;
  const key = `${category}/${filename}`;
  const data = loadTags();
  res.json(data[key] || []);
});

// POST /api/tags/:category/:filename
// Sets (replaces) the tags for a specific image
// Body: { tags: string[] }
router.post('/:category/:filename', (req, res) => {
  const { category, filename } = req.params;
  const { tags } = req.body;

  if (!Array.isArray(tags)) {
    return res.status(400).json({ error: '"tags" must be an array of strings.' });
  }

  const cleaned = tags
    .filter(t => typeof t === 'string')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0);

  const key = `${category}/${filename}`;
  const data = loadTags();

  if (cleaned.length === 0) {
    delete data[key];
  } else {
    data[key] = [...new Set(cleaned)];
  }

  saveTags(data);
  res.json(data[key] || []);
});

// DELETE /api/tags/:category/:filename
// Removes all tags from a specific image
router.delete('/:category/:filename', (req, res) => {
  const { category, filename } = req.params;
  const key = `${category}/${filename}`;
  const data = loadTags();
  delete data[key];
  saveTags(data);
  res.json([]);
});

module.exports = router;

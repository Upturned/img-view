const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const TAG_FILES = {
  image: path.join(__dirname, '../../data/tags-images.json'),
  video: path.join(__dirname, '../../data/tags-videos.json'),
};

function getTagsPath(type) {
  return TAG_FILES[type] || TAG_FILES.image;
}

function loadTags(type) {
  try {
    return JSON.parse(fs.readFileSync(getTagsPath(type), 'utf8'));
  } catch {
    return {};
  }
}

function saveTags(data, type) {
  const filePath = getTagsPath(type);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// GET /api/tags
// Returns the full tags map: { "category/filename": ["tag1", "tag2"] }
// Optional ?type=image|video (default: image)
router.get('/', (req, res) => {
  res.json(loadTags(req.query.type));
});

// GET /api/tags/all
// Returns sorted tag list with counts: [{ tag, count }, ...]
// Optional ?category= to scope counts to a specific category
// Optional ?type=image|video (default: image)
router.get('/all', (req, res) => {
  const { category, type } = req.query;
  const data = loadTags(type);
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
// Adds a single tag to multiple files (non-destructive: existing tags are kept)
// Body: { images: [{category, filename}], tag: string, type?: 'image'|'video' }
router.post('/batch-add', (req, res) => {
  const { images, tag, type } = req.body;

  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: '"images" must be a non-empty array.' });
  }
  if (!tag || typeof tag !== 'string' || !tag.trim()) {
    return res.status(400).json({ error: '"tag" is required.' });
  }

  const normalized = tag.trim().toLowerCase();
  const data = loadTags(type);
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

  saveTags(data, type);
  res.json({ message: `Added tag "${normalized}" to ${added} file(s).`, added });
});

// GET /api/tags/:category/:filename
// Returns tags for a specific file
// Optional ?type=image|video (default: image)
router.get('/:category/:filename', (req, res) => {
  const { category, filename } = req.params;
  const key = `${category}/${filename}`;
  const data = loadTags(req.query.type);
  res.json(data[key] || []);
});

// POST /api/tags/:category/:filename
// Sets (replaces) the tags for a specific file
// Body: { tags: string[] }
// Optional ?type=image|video (default: image)
router.post('/:category/:filename', (req, res) => {
  const { category, filename } = req.params;
  const { tags } = req.body;
  const type = req.query.type;

  if (!Array.isArray(tags)) {
    return res.status(400).json({ error: '"tags" must be an array of strings.' });
  }

  const cleaned = tags
    .filter(t => typeof t === 'string')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0);

  const key = `${category}/${filename}`;
  const data = loadTags(type);

  if (cleaned.length === 0) {
    delete data[key];
  } else {
    data[key] = [...new Set(cleaned)];
  }

  saveTags(data, type);
  res.json(data[key] || []);
});

// DELETE /api/tags/:category/:filename
// Removes all tags from a specific file
// Optional ?type=image|video (default: image)
router.delete('/:category/:filename', (req, res) => {
  const { category, filename } = req.params;
  const key = `${category}/${filename}`;
  const data = loadTags(req.query.type);
  delete data[key];
  saveTags(data, req.query.type);
  res.json([]);
});

module.exports = router;

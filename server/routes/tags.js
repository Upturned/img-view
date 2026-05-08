const express = require('express');
const router = express.Router();
const { db, getFile, upsertFile } = require('../utils/db');

// GET /api/tags — full tags map: { "category/filename": ["tag1", "tag2"] }
// ?type=image|video (default: image)
router.get('/', (req, res) => {
  const type = req.query.type || 'image';
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
  res.json(map);
});

// GET /api/tags/all — sorted tag list with counts: [{ tag, count }]
// ?category= ?type=image|video
router.get('/all', (req, res) => {
  const { category, type = 'image' } = req.query;

  const rows = category
    ? db.prepare(`
        SELECT t.name, COUNT(*) as count
        FROM file_tags ft
        JOIN files f ON f.id = ft.file_id
        JOIN tags  t ON t.id = ft.tag_id
        WHERE f.type = ? AND f.category = ?
        GROUP BY t.id ORDER BY t.name
      `).all(type, category)
    : db.prepare(`
        SELECT t.name, COUNT(*) as count
        FROM file_tags ft
        JOIN files f ON f.id = ft.file_id
        JOIN tags  t ON t.id = ft.tag_id
        WHERE f.type = ?
        GROUP BY t.id ORDER BY t.name
      `).all(type);

  res.json(rows.map(r => ({ tag: r.name, count: r.count })));
});

// POST /api/tags/batch-add — add one tag to multiple files (non-destructive)
// Body: { images: [{category, filename}], tag: string, type?: 'image'|'video' }
router.post('/batch-add', (req, res) => {
  const { images, tag, type = 'image' } = req.body;

  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: '"images" must be a non-empty array.' });
  }
  if (!tag || typeof tag !== 'string' || !tag.trim()) {
    return res.status(400).json({ error: '"tag" is required.' });
  }

  const normalized = tag.trim().toLowerCase();
  db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).run(normalized);
  const tagRow   = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(normalized);
  const stmtLink = db.prepare(`INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)`);

  let added = 0;
  db.transaction(() => {
    for (const { category, filename } of images) {
      if (!category || !filename) continue;
      const fileRow = upsertFile(type, category, filename);
      if (!fileRow) continue;
      const result = stmtLink.run(fileRow.id, tagRow.id);
      if (result.changes > 0) added++;
    }
  })();

  res.json({ message: `Added tag "${normalized}" to ${added} file(s).`, added });
});

// GET /api/tags/:category/:filename — tags for one file
// ?type=image|video
router.get('/:category/:filename', (req, res) => {
  const { category, filename } = req.params;
  const type    = req.query.type || 'image';
  const fileRow = getFile(type, category, filename);
  if (!fileRow) return res.json([]);

  const tags = db.prepare(`
    SELECT t.name FROM file_tags ft
    JOIN tags t ON t.id = ft.tag_id
    WHERE ft.file_id = ?
    ORDER BY t.name
  `).all(fileRow.id).map(r => r.name);

  res.json(tags);
});

// POST /api/tags/:category/:filename — set (replace) tags for one file
// Body: { tags: string[] }  ?type=image|video
router.post('/:category/:filename', (req, res) => {
  const { category, filename } = req.params;
  const { tags } = req.body;
  const type = req.query.type || 'image';

  if (!Array.isArray(tags)) {
    return res.status(400).json({ error: '"tags" must be an array of strings.' });
  }

  const cleaned = [...new Set(
    tags.filter(t => typeof t === 'string')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0)
  )];

  const fileRow   = upsertFile(type, category, filename);
  const stmtUpsertTag = db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`);
  const stmtGetTag    = db.prepare(`SELECT id FROM tags WHERE name = ?`);
  const stmtClear     = db.prepare(`DELETE FROM file_tags WHERE file_id = ?`);
  const stmtLink      = db.prepare(`INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)`);

  db.transaction(() => {
    stmtClear.run(fileRow.id);
    for (const tag of cleaned) {
      stmtUpsertTag.run(tag);
      const tagRow = stmtGetTag.get(tag);
      stmtLink.run(fileRow.id, tagRow.id);
    }
  })();

  res.json(cleaned);
});

// DELETE /api/tags/:category/:filename — remove all tags from one file
// ?type=image|video
router.delete('/:category/:filename', (req, res) => {
  const { category, filename } = req.params;
  const type    = req.query.type || 'image';
  const fileRow = getFile(type, category, filename);
  if (fileRow) {
    db.prepare('DELETE FROM file_tags WHERE file_id = ?').run(fileRow.id);
  }
  res.json([]);
});

module.exports = router;

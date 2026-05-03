const express = require('express');
const router = express.Router();
const { db, upsertFile } = require('../utils/db');

// GET /api/favorites — returns { "category/filename": true } for all favorited files
router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT category, filename FROM files WHERE favorited = 1`).all();
  const map = {};
  for (const { category, filename } of rows) {
    map[`${category}/${filename}`] = true;
  }
  res.json(map);
});

// POST /api/favorites/:category/:filename — toggle favorite state
// Returns { favorited: bool }
// ?type=image|video (default: image)
router.post('/:category/:filename', (req, res) => {
  const { category, filename } = req.params;
  const type = req.query.type || 'image';

  const fileRow  = upsertFile(type, category, filename);
  const favorited = fileRow.favorited ? 0 : 1;
  db.prepare('UPDATE files SET favorited = ? WHERE id = ?').run(favorited, fileRow.id);
  res.json({ favorited: favorited === 1 });
});

module.exports = router;

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/imgview.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Migrations ────────────────────────────────────────────────────────────────

const migrations = [
  // v1 — initial schema + seed from existing JSON files
  () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        type        TEXT    NOT NULL CHECK(type IN ('image', 'video', 'audio', 'text')),
        category    TEXT    NOT NULL,
        filename    TEXT    NOT NULL,
        extension   TEXT    NOT NULL,
        path        TEXT    NOT NULL,
        favorited   INTEGER NOT NULL DEFAULT 0,
        recycled    INTEGER NOT NULL DEFAULT 0,
        notes       TEXT,
        size        INTEGER,
        modified_at INTEGER,
        UNIQUE(type, category, filename),
        UNIQUE(path, type)
      );

      CREATE TABLE IF NOT EXISTS tags (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS file_tags (
        file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
        PRIMARY KEY (file_id, tag_id)
      );
    `);
    seedFromJson();
  },
];

function runMigrations() {
  const current = db.pragma('user_version', { simple: true });
  for (let i = current; i < migrations.length; i++) {
    migrations[i]();
    db.pragma(`user_version = ${i + 1}`);
    console.log(`[db] Migration ${i + 1} applied.`);
  }
}

// ── Seed from existing JSON files ─────────────────────────────────────────────
// Idempotent — safe to call multiple times.

function seedFromJson() {
  const dataDir = path.join(__dirname, '../../data');
  let imageTags = {};
  let videoTags = {};
  let favorites = {};

  try { imageTags = JSON.parse(fs.readFileSync(path.join(dataDir, 'tags-images.json'), 'utf8')); } catch {}
  try { videoTags = JSON.parse(fs.readFileSync(path.join(dataDir, 'tags-videos.json'), 'utf8')); } catch {}
  try { favorites = JSON.parse(fs.readFileSync(path.join(dataDir, 'favorites.json'), 'utf8')); } catch {}

  const stmtUpsertFile = db.prepare(`
    INSERT INTO files (type, category, filename, extension, path, favorited)
    VALUES (@type, @category, @filename, @extension, @path, @favorited)
    ON CONFLICT(type, category, filename) DO UPDATE SET favorited = excluded.favorited
  `);
  const stmtUpsertTag = db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`);
  const stmtGetTag    = db.prepare(`SELECT id FROM tags WHERE name = ?`);
  const stmtGetFile   = db.prepare(`SELECT id FROM files WHERE type = ? AND category = ? AND filename = ?`);
  const stmtLinkTag   = db.prepare(`INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)`);

  const run = db.transaction(() => {
    const allTagged = [
      ...Object.entries(imageTags).map(([k, v]) => ({ key: k, tags: v, type: 'image' })),
      ...Object.entries(videoTags).map(([k, v]) => ({ key: k, tags: v, type: 'video' })),
    ];

    for (const { key, tags, type } of allTagged) {
      const slash = key.indexOf('/');
      if (slash === -1) continue;
      const category = key.slice(0, slash);
      const filename = key.slice(slash + 1);
      const extension = path.extname(filename).toLowerCase();
      const favorited = favorites[key] ? 1 : 0;

      stmtUpsertFile.run({ type, category, filename, extension, path: key, favorited });

      const fileRow = stmtGetFile.get(type, category, filename);
      if (!fileRow) continue;

      for (const tag of tags) {
        const normalized = tag.trim().toLowerCase();
        if (!normalized) continue;
        stmtUpsertTag.run(normalized);
        const tagRow = stmtGetTag.get(normalized);
        stmtLinkTag.run(fileRow.id, tagRow.id);
      }
    }

    // Import favorited files that have no tags (won't appear in the tag maps)
    for (const [key, val] of Object.entries(favorites)) {
      if (!val) continue;
      const slash = key.indexOf('/');
      if (slash === -1) continue;
      const category = key.slice(0, slash);
      const filename = key.slice(slash + 1);
      const extension = path.extname(filename).toLowerCase();
      stmtUpsertFile.run({ type: 'image', category, filename, extension, path: key, favorited: 1 });
    }
  });

  run();
  console.log('[db] Seed from JSON complete.');
}

// ── Shared helpers ────────────────────────────────────────────────────────────

// Returns the file row or null.
function getFile(type, category, filename) {
  return db.prepare('SELECT * FROM files WHERE type = ? AND category = ? AND filename = ?')
           .get(type, category, filename);
}

// Returns the file row, inserting it first if it doesn't exist.
function upsertFile(type, category, filename) {
  const ext      = path.extname(filename).toLowerCase();
  const filePath = `${category}/${filename}`;
  db.prepare(`
    INSERT INTO files (type, category, filename, extension, path)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(type, category, filename) DO NOTHING
  `).run(type, category, filename, ext, filePath);
  return getFile(type, category, filename);
}

runMigrations();

module.exports = { db, getFile, upsertFile, seedFromJson };

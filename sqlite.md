# SQLite Migration Plan

## 1. Why SQLite?

The current data layer uses flat JSON files (`tags-images.json`, `tags-videos.json`, `favorites.json`), keyed by `"category/filename"`. This has two fundamental problems:

**Path coupling.** Every key is a file path. Moving or renaming a file silently orphans its tags and favorites unless the code manually patches the JSON on every operation. The rename route in `files.js` already does this for tags — but only for tags, not favorites, and only for the rename case. Move, bulk-move, recycle, and restore are all uncovered. Every new feature that touches files inherits this problem.

**Unsafe writes.** `JSON.stringify` + `writeFileSync` rewrites the whole file atomically *on a good day*. A crash mid-write corrupts or silently truncates it. This is almost certainly what caused the repeated tag loss.

SQLite solves both: rows have a stable numeric `id` unrelated to file paths, and writes are transactional — they either fully commit or fully roll back.

There is also an existing inconsistency worth noting: `categories.js` and the `files.js` rename route still read from `tags.json`, while the tags route reads from `tags-images.json` / `tags-videos.json`. These are different files. This means filtered category views and post-rename tag state may diverge silently. The migration is a good moment to clean this up.

---

## 2. How We Use SQLite — the `better-sqlite3` Package

Install:

```
npm install better-sqlite3
```

Unlike most Node database drivers, `better-sqlite3` is **synchronous**. There is no `await`, no callbacks. This fits the existing Express routes naturally — they are currently synchronous too (blocking file I/O). The migration does not require restructuring the route logic.

A shared DB connection lives in one file, `server/utils/db.js`, opened once at startup:

```js
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../../data/imgview.db'));
db.pragma('journal_mode = WAL');   // safe concurrent reads
db.pragma('foreign_keys = ON');    // enforce referential integrity

module.exports = db;
```

All routes `require('../utils/db')` and use prepared statements:

```js
const db = require('../utils/db');

// Read
const file = db.prepare('SELECT * FROM files WHERE type = ? AND category = ? AND filename = ?')
               .get('image', 'cats', 'photo.jpg');

// Write
db.prepare('UPDATE files SET favorited = ? WHERE id = ?').run(1, file.id);

// Transaction
const move = db.transaction((id, newCategory, newFilename) => {
  db.prepare('UPDATE files SET category = ?, filename = ?, path = ? WHERE id = ?')
    .run(newCategory, newFilename, `${newCategory}/${newFilename}`, id);
});
move(42, 'dogs', 'renamed.jpg');
```

Prepared statements are compiled once and reused — no SQL injection risk, no per-call parsing overhead.

---

## 3. Migrations

Yes, migrations work the same way for `.db` files as for any SQL database — you run `ALTER TABLE`, `CREATE TABLE`, etc. SQLite has some limitations (e.g. you cannot drop or rename a column in older versions), but for adding new columns and tables it is fully standard.

The simplest migration system for this project: SQLite's built-in `PRAGMA user_version`, which is an integer you control. On startup, `db.js` reads the current version and runs any pending migration functions in order:

```js
const migrations = [
  // v1 → initial schema
  () => db.exec(`
    CREATE TABLE IF NOT EXISTS files ( ... );
    CREATE TABLE IF NOT EXISTS tags ( ... );
    CREATE TABLE IF NOT EXISTS file_tags ( ... );
  `),
  // v2 → add notes column
  () => db.exec(`ALTER TABLE files ADD COLUMN notes TEXT`),
];

const current = db.pragma('user_version', { simple: true });
for (let i = current; i < migrations.length; i++) {
  migrations[i]();
  db.pragma(`user_version = ${i + 1}`);
}
```

Each migration function runs only once, in order. To add a schema change: append a new function to the array. No external tools needed.

### Seed migration — importing existing JSON data

The first migration (`v1`) should not only create the schema but also import whatever already exists in the JSON files, so no data is lost on the first run.

A dedicated `seedFromJson()` function handles this. It is called at the end of `v1` and also exported so `server/routes/files.js` can call it after a successful Organize operation (which moves files on disk and may surface new ones).

```js
function seedFromJson(db) {
  const dataDir = path.join(__dirname, '../../data');

  // --- Tags (images) ---
  let imageTags = {};
  try { imageTags = JSON.parse(fs.readFileSync(path.join(dataDir, 'tags-images.json'), 'utf8')); } catch {}

  // --- Tags (videos) ---
  let videoTags = {};
  try { videoTags = JSON.parse(fs.readFileSync(path.join(dataDir, 'tags-videos.json'), 'utf8')); } catch {}

  // --- Favorites ---
  let favorites = {};
  try { favorites = JSON.parse(fs.readFileSync(path.join(dataDir, 'favorites.json'), 'utf8')); } catch {}

  const upsertFile = db.prepare(`
    INSERT INTO files (type, category, filename, extension, path, favorited)
    VALUES (@type, @category, @filename, @extension, @path, @favorited)
    ON CONFLICT(path, type) DO UPDATE SET favorited = excluded.favorited
  `);

  const upsertTag = db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`);
  const getTag    = db.prepare(`SELECT id FROM tags WHERE name = ?`);
  const getFile   = db.prepare(`SELECT id FROM files WHERE path = ? AND type = ?`);
  const linkTag   = db.prepare(`INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)`);

  const importAll = db.transaction(() => {
    // Insert files from tags maps (these are the files the app knows about)
    for (const [key, tags] of Object.entries({ ...imageTags, ...videoTags })) {
      const type = key in imageTags ? 'image' : 'video';
      const slash = key.indexOf('/');
      if (slash === -1) continue;
      const category = key.slice(0, slash);
      const filename = key.slice(slash + 1);
      const extension = path.extname(filename).toLowerCase();
      const favorited = favorites[key] ? 1 : 0;

      upsertFile.run({ type, category, filename, extension, path: key, favorited });

      const fileRow = getFile.get(key, type);
      if (!fileRow) continue;

      for (const tag of tags) {
        upsertTag.run(tag);
        const tagRow = getTag.get(tag);
        linkTag.run(fileRow.id, tagRow.id);
      }
    }

    // Also import favorited files that have no tags (they won't appear in the tag maps)
    for (const [key, val] of Object.entries(favorites)) {
      if (!val) continue;
      const slash = key.indexOf('/');
      if (slash === -1) continue;
      const category = key.slice(0, slash);
      const filename = key.slice(slash + 1);
      const extension = path.extname(filename).toLowerCase();
      upsertFile.run({ type: 'image', category, filename, extension, path: key, favorited: 1 });
    }
  });

  importAll();
}
```

**Important:** `tags-images.json`, `tags-videos.json`, and `favorites.json` should be kept on disk until the new routes are confirmed working. After that they can be deleted — the DB is the sole source of truth.

The seed function is intentionally idempotent (`ON CONFLICT ... DO UPDATE`, `INSERT OR IGNORE`) so running it multiple times is safe.

---

## 4. Tables

### `files`

One row per tracked media file, regardless of type.

```sql
CREATE TABLE files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT    NOT NULL CHECK(type IN ('image', 'video', 'audio', 'text')),
  category    TEXT    NOT NULL,
  filename    TEXT    NOT NULL,
  extension   TEXT    NOT NULL,   -- e.g. '.jpg', '.mp4', '.mp3'
  path        TEXT    NOT NULL,   -- "category/filename" — the current JSON key
  favorited   INTEGER NOT NULL DEFAULT 0,
  recycled    INTEGER NOT NULL DEFAULT 0,
  notes       TEXT,               -- free-form text per file (stories feature)
  size        INTEGER,            -- bytes, from fs.statSync
  modified_at INTEGER,            -- mtime in ms, from fs.statSync
  UNIQUE(type, category, filename),
  UNIQUE(path, type)
);
```

**Why one table and not one per type?** Tags, favorites, notes, and the move/rename/recycle operations apply to all file types equally. Splitting by type means duplicating all that logic with no benefit. The `type` column + a check constraint gives you the same safety with a single schema.

### `tags`

A deduplicated list of every tag name that exists.

```sql
CREATE TABLE tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
```

### `file_tags`

Many-to-many join between files and tags. A file can have many tags; a tag can belong to many files.

```sql
CREATE TABLE file_tags (
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (file_id, tag_id)
);
```

`ON DELETE CASCADE` means deleting a file row automatically removes its tag associations. No manual cleanup needed.

**Thumbnails are not stored in the DB.** They are derived artifacts with a deterministic path (`thumbnails/category/filename.webp`). The file on disk is the source of truth. `thumbnails.js` does not need to change.

---

## 5. Technical Notes

**What changes in the routes:**

| File | Change |
|---|---|
| `server/routes/favorites.js` | Replace `loadFavorites`/`saveFavorites` with `UPDATE files SET favorited` |
| `server/routes/tags.js` | Replace JSON read/write with INSERT/DELETE on `file_tags` + `tags` |
| `server/routes/categories.js` | Tag filter becomes a `JOIN file_tags` query instead of loading the full JSON map |
| `server/routes/files.js` (rename, move) | Update `files.category`, `files.filename`, `files.path` in the same transaction as the disk operation |
| `server/routes/recycle.js` | Replace `loadFavorites` check with a DB read; set `files.recycled = 1` instead of moving the file on disk (optional, see below) |

**What does not change:** `scanner.js`, `thumbnails.js`, all Express static routes, the entire frontend.

**File registration on scan.** The DB tracks files that have been seen by the app. When a category is scanned, the route can upsert rows for any files not yet in the DB:

```js
db.prepare(`
  INSERT INTO files (type, category, filename, extension, path)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(path, type) DO NOTHING
`).run(type, category, filename, ext, `${category}/${filename}`);
```

This means a file gets a stable `id` the first time it is opened or its category is visited.

**External moves (files moved in Explorer, not through the app).** SQLite solves in-app moves fully. For external moves the path key is still broken. The medium-term fix is a content-hash column — hash the first ~64 KB of the file on first registration, store it in `files`. A background reconciliation pass can re-link rows whose path no longer exists on disk by matching hashes. This is optional and can be added as a migration later.

**Viewing the DB.** DBeaver supports SQLite natively — create a new SQLite connection and point it at `data/imgview.db`. The VS Code extension "SQLite Viewer" works for read-only inspection without leaving the editor.

**Backup.** The entire data layer is one file: `data/imgview.db`. Add it to your backup routine. It should remain in `.gitignore` alongside the current JSON files.

**Dependency.** `better-sqlite3` has a native addon (compiled C++). On Windows it installs fine via npm with no extra setup as long as you have Node installed. If you ever run `npm install` on a different machine or Node version, it will recompile automatically.

---

## 6. Non-Technical Notes

The migration is mechanical but not trivial — every route that currently touches a JSON file needs to be rewritten. The routes are short and the logic is simple, so in practice this is a few focused hours of work.

The right moment to do it is **before** adding notes, music, or the storytelling feature — each of those would otherwise get their own JSON file and inherit the same fragility. Doing it once now means every future feature gets a stable foundation for free.

After the migration, `data/tags-images.json`, `data/tags-videos.json`, and `data/favorites.json` can be deleted. Keep them around as a backup until the new routes are confirmed working.

const express = require("express");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const router = express.Router();
const scanner = require("../utils/scanner");
const { thumbPath, cleanStaleThumbs, generateCategoryThumbs } = require("../utils/thumbnails");

// ── File picker via PowerShell native dialog ──
// Opens a Windows OpenFileDialog and returns the chosen path, or null if cancelled.
function openFilePicker(type) {
  const imageExts = "*.jpg;*.jpeg;*.png;*.gif;*.webp;*.svg;*.avif";
  const videoExts = "*.mp4;*.webm";

  const filter =
    type === "video"
      ? `Video files|${videoExts}|All files|*.*`
      : `Image files|${imageExts}|All files|*.*`;

  const title =
    type === "video" ? "Select a video file" : "Select an image file";

  // TopMost form keeps the dialog in front of the browser window
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms;",
    "$form = New-Object System.Windows.Forms.Form;",
    "$form.TopMost = $true;",
    "$d = New-Object System.Windows.Forms.OpenFileDialog;",
    `$d.Filter = '${filter}';`,
    `$d.Title = '${title}';`,
    "$d.Multiselect = $false;",
    "$r = $d.ShowDialog($form);",
    'if ($r -eq "OK") { $d.FileName } else { "" }',
  ].join(" ");

  try {
    const result = execSync(`powershell -NoProfile -Command "${script}"`, {
      timeout: 300000,
    })
      .toString()
      .trim();
    return result || null;
  } catch {
    return null;
  }
}

// Resolves and validates that a file path stays within the expected base dir.
function safeResolve(baseDir, category, filename) {
  const resolved = path.resolve(path.join(baseDir, category, filename));
  const resolvedBase = path.resolve(baseDir);
  if (!resolved.startsWith(resolvedBase + path.sep)) return null;
  return resolved;
}

function baseDir(type) {
  return type === "video" ? scanner.getVideosDir() : scanner.getImagesDir();
}

// POST /api/files/move
// Moves a file from one category to another.
// Body: { filename, fromCategory, toCategory, type: 'image' | 'video' }
router.post("/move", (req, res) => {
  const { filename, fromCategory, toCategory, type = "image" } = req.body;

  if (!filename || !fromCategory || !toCategory) {
    return res
      .status(400)
      .json({ error: "filename, fromCategory, and toCategory are required." });
  }

  const base = baseDir(type);
  const src = safeResolve(base, fromCategory, filename);
  const dest = safeResolve(base, toCategory, filename);

  if (!src || !dest) return res.status(403).json({ error: "Access denied." });
  if (!fs.existsSync(src))
    return res.status(404).json({ error: "Source file not found." });

  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  if (fs.existsSync(dest)) {
    return res.status(409).json({
      error: "A file with that name already exists in the destination.",
    });
  }

  try {
    fs.renameSync(src, dest);

    // Move thumbnail so it stays linked to the file in its new location
    if (type !== 'video') {
      const oldThumb = thumbPath(fromCategory, filename);
      const newThumb = thumbPath(toCategory, filename);
      const newThumbDir = path.dirname(newThumb);
      if (fs.existsSync(oldThumb)) {
        if (!fs.existsSync(newThumbDir)) fs.mkdirSync(newThumbDir, { recursive: true });
        try { fs.renameSync(oldThumb, newThumb); } catch { /* non-critical */ }
      }
    }

    res.json({ message: "File moved.", to: `${toCategory}/${filename}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/copy
// Copies a file from one category to another.
// Body: { filename, fromCategory, toCategory, type: 'image' | 'video' }
router.post("/copy", (req, res) => {
  const { filename, fromCategory, toCategory, type = "image" } = req.body;

  if (!filename || !fromCategory || !toCategory) {
    return res
      .status(400)
      .json({ error: "filename, fromCategory, and toCategory are required." });
  }

  const base = baseDir(type);
  const src = safeResolve(base, fromCategory, filename);
  const dest = safeResolve(base, toCategory, filename);

  if (!src || !dest) return res.status(403).json({ error: "Access denied." });
  if (!fs.existsSync(src))
    return res.status(404).json({ error: "Source file not found." });

  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  if (fs.existsSync(dest)) {
    return res.status(409).json({
      error: "A file with that name already exists in the destination.",
    });
  }

  try {
    fs.copyFileSync(src, dest);
    res.json({ message: "File copied.", to: `${toCategory}/${filename}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/organize-loose
// Moves all loose files from the root of /images and /videos into holding folders.
// Also triggers thumbnail generation for any image categories that received new files.
router.post("/organize-loose", (req, res) => {
  try {
    const moved = scanner.organizeLooseFiles();

    // Kick off thumb generation for each image category that received files (fire and forget)
    const imagesDir = scanner.getImagesDir();
    const affectedCategories = new Set();
    for (const { to } of moved) {
      const rel = path.relative(imagesDir, path.dirname(to));
      if (rel && !rel.startsWith('..')) affectedCategories.add(rel);
    }
    for (const cat of affectedCategories) {
      generateCategoryThumbs(cat).catch(err =>
        console.error('[thumbnails] Error generating thumbs after organize:', err.message)
      );
    }

    res.json({ message: `Organized ${moved.length} loose file(s).`, moved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/organize-deep
// Scans inside every category subfolder and moves misplaced files:
//   videos inside /images/**  → videos/loose-videos/
//   images inside /videos/**  → images/loose-images/
router.post("/organize-deep", (req, res) => {
  try {
    const moved = scanner.organizeDeep();
    res.json({ message: `Moved ${moved.length} misplaced file(s).`, moved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/pick
// Opens a native Windows file picker dialog, then copies the chosen file
// into the specified category folder.
// Body: { type: 'image' | 'video', category: string }
// Returns: { filename, category } or { cancelled: true }
router.post("/pick", (req, res) => {
  const { type = "image", category } = req.body;

  if (!category)
    return res.status(400).json({ error: "category is required." });

  const baseDir =
    type === "video" ? scanner.getVideosDir() : scanner.getImagesDir();
  const categoryPath = path.join(baseDir, category);

  if (!fs.existsSync(categoryPath)) {
    return res.status(404).json({ error: "Category not found." });
  }

  const pickedPath = openFilePicker(type);

  if (!pickedPath) return res.json({ cancelled: true });

  const filename = path.basename(pickedPath);
  let destPath = path.join(categoryPath, filename);

  // Avoid overwriting — append suffix if needed
  if (fs.existsSync(destPath)) {
    const ext = path.extname(filename);
    const base = path.join(categoryPath, path.basename(filename, ext));
    let i = 1;
    do {
      destPath = `${base} (${i++})${ext}`;
    } while (fs.existsSync(destPath));
  }

  try {
    fs.copyFileSync(pickedPath, destPath);
    res.json({ filename: path.basename(destPath), category });
  } catch (err) {
    res.status(500).json({ error: `Failed to copy file: ${err.message}` });
  }
});

// GET /api/files/loose
// Reports loose files without moving them.
router.get("/loose", (req, res) => {
  try {
    const loose = scanner.scanLooseFiles();
    const total =
      loose.images.length + loose.videos.length + loose.others.length;
    res.json({ total, ...loose });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/move-bulk
// Moves multiple files to a single destination category.
// Body: { files: [{filename, fromCategory}], toCategory, type: 'image' | 'video' }
router.post("/move-bulk", (req, res) => {
  const { files, toCategory, type = "image" } = req.body;
  if (!Array.isArray(files) || !files.length || !toCategory) {
    return res.status(400).json({ error: "files (array) and toCategory are required." });
  }

  const base = baseDir(type);
  const moved = [];
  const errors = [];

  for (const { filename, fromCategory } of files) {
    if (!filename || !fromCategory) { errors.push({ filename, error: "Missing fields." }); continue; }

    const src  = safeResolve(base, fromCategory, filename);
    const dest = safeResolve(base, toCategory,   filename);
    if (!src || !dest) { errors.push({ filename, error: "Access denied." }); continue; }
    if (!fs.existsSync(src)) { errors.push({ filename, error: "Source not found." }); continue; }

    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    if (fs.existsSync(dest)) { errors.push({ filename, error: "Already exists in destination." }); continue; }

    try {
      fs.renameSync(src, dest);
      moved.push(filename);

      if (type !== 'video') {
        const oldThumb = thumbPath(fromCategory, filename);
        const newThumb = thumbPath(toCategory, filename);
        const newThumbDir = path.dirname(newThumb);
        if (fs.existsSync(oldThumb)) {
          if (!fs.existsSync(newThumbDir)) fs.mkdirSync(newThumbDir, { recursive: true });
          try { fs.renameSync(oldThumb, newThumb); } catch { /* non-critical */ }
        }
      }
    } catch (err) {
      errors.push({ filename, error: err.message });
    }
  }

  res.json({ moved: moved.length, errors });
});

// POST /api/files/copy-bulk
// Copies multiple files to a single destination category.
// Body: { files: [{filename, fromCategory}], toCategory, type: 'image' | 'video' }
router.post("/copy-bulk", (req, res) => {
  const { files, toCategory, type = "image" } = req.body;
  if (!Array.isArray(files) || !files.length || !toCategory) {
    return res.status(400).json({ error: "files (array) and toCategory are required." });
  }

  const base = baseDir(type);
  const copied = [];
  const errors = [];

  for (const { filename, fromCategory } of files) {
    if (!filename || !fromCategory) { errors.push({ filename, error: "Missing fields." }); continue; }

    const src  = safeResolve(base, fromCategory, filename);
    const dest = safeResolve(base, toCategory,   filename);
    if (!src || !dest) { errors.push({ filename, error: "Access denied." }); continue; }
    if (!fs.existsSync(src)) { errors.push({ filename, error: "Source not found." }); continue; }

    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    if (fs.existsSync(dest)) { errors.push({ filename, error: "Already exists in destination." }); continue; }

    try {
      fs.copyFileSync(src, dest);
      copied.push(filename);
    } catch (err) {
      errors.push({ filename, error: err.message });
    }
  }

  res.json({ copied: copied.length, errors });
});

// POST /api/files/cleanup-thumbs
// Deletes thumbnails whose source image no longer exists on disk.
router.post("/cleanup-thumbs", (req, res) => {
  try {
    const removed = cleanStaleThumbs();
    res.json({ message: `Removed ${removed} stale thumbnail(s).`, removed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/rename
// Body: { category, oldFilename, newFilename, type: 'image' | 'video' }
router.post("/rename", (req, res) => {
  const { category, oldFilename, newFilename, type = 'image' } = req.body;

  if (!category || !oldFilename || !newFilename) {
    return res
      .status(400)
      .json({ error: "category, oldFilename and newFilename are required." });
  }

  //strip path separators so no scape from the folder
  const safeName = path.basename(newFilename.trim());
  if (!safeName) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  const baseDir =
    type === "video" ? scanner.getVideosDir() : scanner.getImagesDir();
  const src = safeResolve(baseDir, category, oldFilename);
  const dest = safeResolve(baseDir, category, safeName);

  if (!src || !dest) return res.status(403).json({ error: "Access denied." });
  if (!fs.existsSync(src))
    return res.status(404).json({ error: "File not found." });
  if (fs.existsSync(dest))
    return res
      .status(409)
      .json({ error: "A file with that name already exists." });

  // Rename the file on disk
  fs.renameSync(src, dest);

  // Rename the thumbnail if one exists (images only)
  if (type !== 'video') {
    const { thumbPath } = require('../utils/thumbnails');
    const oldThumb = thumbPath(category, oldFilename);
    const newThumb = thumbPath(category, safeName);
    if (fs.existsSync(oldThumb)) {
      try { fs.renameSync(oldThumb, newThumb); } catch { /* non-critical */ }
    }
  }

  // Update tags.json — the key is "category/filename", so it changes
  const tagsPath = path.join(__dirname, "../../data/tags.json");
  try {
    const tags = JSON.parse(fs.readFileSync(tagsPath, "utf8"));
    const oldKey = `${category}/${oldFilename}`;
    const newKey = `${category}/${safeName}`;
    if (tags[oldKey]) {
      tags[newKey] = tags[oldKey];
      delete tags[oldKey];
      fs.writeFileSync(tagsPath, JSON.stringify(tags, null, 2), "utf8");
    }
  } catch {
    /* tags are non-critical, keep going */
  }

  res.json({ filename: safeName, category });
});

module.exports = router;

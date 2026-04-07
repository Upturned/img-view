const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '../../');
const IMAGES_DIR = path.join(ROOT, 'images');
const THUMBNAILS_DIR = path.join(ROOT, 'thumbnails');

const THUMB_WIDTH = 300;

// SVG files are served as-is (already vector, no need to rasterize for thumbnails)
const SKIP_EXTENSIONS = new Set(['.svg']);

function thumbPath(category, filename) {
  return path.join(THUMBNAILS_DIR, category, filename + '.webp');
}

function thumbExists(category, filename) {
  return fs.existsSync(thumbPath(category, filename));
}

// Generates a thumbnail for one image. Skips if already cached.
// Returns the thumbnail path on success, null if skipped (SVG) or failed.
async function generateThumb(category, filename) {
  const ext = path.extname(filename).toLowerCase();

  if (SKIP_EXTENSIONS.has(ext)) return null;

  const srcPath = path.join(IMAGES_DIR, category, filename);
  const destPath = thumbPath(category, filename);
  const destDir = path.dirname(destPath);

  if (fs.existsSync(destPath)) return destPath;

  if (!fs.existsSync(srcPath)) return null;

  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  try {
    await sharp(srcPath, { animated: false })
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(destPath);

    return destPath;
  } catch (err) {
    console.error(`[thumbnails] Failed to generate thumb for ${category}/${filename}:`, err.message);
    return null;
  }
}

// Generates thumbnails for every image in a category.
// Runs in parallel with a concurrency cap to avoid overwhelming the CPU.
async function generateCategoryThumbs(category, concurrency = 8) {
  const categoryPath = path.join(IMAGES_DIR, category);
  if (!fs.existsSync(categoryPath)) return;

  const { isImage } = require('./scanner');
  const files = fs.readdirSync(categoryPath).filter(isImage);
  const missing = files.filter(f => !thumbExists(category, f));

  if (missing.length === 0) return;

  console.log(`[thumbnails] Generating ${missing.length} thumbnails for "${category}"...`);

  for (let i = 0; i < missing.length; i += concurrency) {
    const batch = missing.slice(i, i + concurrency);
    await Promise.all(batch.map(f => generateThumb(category, f)));
  }

  console.log(`[thumbnails] Done with "${category}".`);
}

// Generates all missing thumbnails across every category.
// Called once at server startup in the background.
async function generateAllThumbs() {
  if (!fs.existsSync(IMAGES_DIR)) return;

  const entries = fs.readdirSync(IMAGES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    await generateCategoryThumbs(entry.name);
  }
}

// Returns the URL path to serve a thumbnail.
// If no thumbnail exists (SVG or not yet generated), falls back to the original image URL.
function thumbUrl(category, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (SKIP_EXTENSIONS.has(ext)) {
    return `/images/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`;
  }
  return `/thumbnails/${encodeURIComponent(category)}/${encodeURIComponent(filename)}.webp`;
}

// Scans the thumbnails directory and removes any thumbnails whose source
// image no longer exists. Returns the count of deleted files.
function cleanStaleThumbs() {
  let removed = 0;
  if (!fs.existsSync(THUMBNAILS_DIR)) return removed;

  const categories = fs.readdirSync(THUMBNAILS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  for (const category of categories) {
    const thumbCatDir = path.join(THUMBNAILS_DIR, category);
    let thumbFiles;
    try {
      thumbFiles = fs.readdirSync(thumbCatDir).filter(f => f.endsWith('.webp'));
    } catch { continue; }

    for (const thumbFile of thumbFiles) {
      // thumbFile is e.g. "photo.jpg.webp"; strip the trailing ".webp" to get original filename
      const originalFilename = thumbFile.slice(0, -5);
      const srcPath = path.join(IMAGES_DIR, category, originalFilename);
      if (!fs.existsSync(srcPath)) {
        try { fs.unlinkSync(path.join(thumbCatDir, thumbFile)); removed++; } catch { /* non-critical */ }
      }
    }
  }

  return removed;
}

function getThumbnailsDir() { return THUMBNAILS_DIR; }

module.exports = {
  generateThumb,
  generateCategoryThumbs,
  generateAllThumbs,
  thumbExists,
  thumbPath,
  thumbUrl,
  getThumbnailsDir,
  cleanStaleThumbs,
};

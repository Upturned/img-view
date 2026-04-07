const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../');
const IMAGES_DIR = path.join(ROOT, 'images');
const VIDEOS_DIR = path.join(ROOT, 'videos');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm']);

// Folders inside /images that should never surface as user-facing categories
const HIDDEN_CATEGORIES = new Set(['recycle-bin']);

function isImage(filename) {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function isVideo(filename) {
  return VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function getFileInfo(filePath, category, type) {
  const filename = path.basename(filePath);
  const stats = fs.statSync(filePath);
  return {
    filename,
    name: path.parse(filename).name,
    category,
    type,
    modified: stats.mtimeMs,
    size: stats.size,
  };
}

// Returns all categories and a cover image for each
function scanCategories() {
  ensureDir(IMAGES_DIR);

  const entries = fs.readdirSync(IMAGES_DIR, { withFileTypes: true });
  const categories = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (HIDDEN_CATEGORIES.has(entry.name)) continue;

    const categoryPath = path.join(IMAGES_DIR, entry.name);
    const files = fs.readdirSync(categoryPath).filter(isImage);

    categories.push({
      name: entry.name,
      imageCount: files.length,
      cover: files.length > 0 ? files[0] : null,
    });
  }

  return categories;
}

// Returns all images inside a specific category
function scanCategory(categoryName) {
  const categoryPath = path.join(IMAGES_DIR, categoryName);

  if (!fs.existsSync(categoryPath)) return null;

  const files = fs.readdirSync(categoryPath).filter(isImage);
  return files.map(filename =>
    getFileInfo(path.join(categoryPath, filename), categoryName, 'image')
  );
}

// Returns all video categories and a cover (first frame not available — just name/count)
function scanVideoCategories() {
  ensureDir(VIDEOS_DIR);

  const entries = fs.readdirSync(VIDEOS_DIR, { withFileTypes: true });
  const categories = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const categoryPath = path.join(VIDEOS_DIR, entry.name);
    const files = fs.readdirSync(categoryPath).filter(isVideo);

    categories.push({
      name: entry.name,
      videoCount: files.length,
    });
  }

  return categories;
}

// Returns all videos inside a specific video category
function scanVideoCategory(categoryName) {
  const categoryPath = path.join(VIDEOS_DIR, categoryName);

  if (!fs.existsSync(categoryPath)) return null;

  const files = fs.readdirSync(categoryPath).filter(isVideo);
  return files.map(filename =>
    getFileInfo(path.join(categoryPath, filename), categoryName, 'video')
  );
}

// Returns every image across all categories (used for global search and global random)
function scanAllImages() {
  ensureDir(IMAGES_DIR);

  const entries = fs.readdirSync(IMAGES_DIR, { withFileTypes: true });
  const all = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const categoryPath = path.join(IMAGES_DIR, entry.name);
    const files = fs.readdirSync(categoryPath).filter(isImage);

    for (const filename of files) {
      all.push(getFileInfo(path.join(categoryPath, filename), entry.name, 'image'));
    }
  }

  return all;
}

// Detects loose files sitting directly in /images or /videos root (not in any subfolder).
// Returns { images, videos, others } — each is an array of filenames.
function scanLooseFiles() {
  ensureDir(IMAGES_DIR);
  ensureDir(VIDEOS_DIR);

  const result = { images: [], videos: [], others: [] };

  for (const filename of fs.readdirSync(IMAGES_DIR)) {
    const filePath = path.join(IMAGES_DIR, filename);
    if (fs.statSync(filePath).isDirectory()) continue;
    if (isImage(filename)) result.images.push(filename);
    else if (isVideo(filename)) result.videos.push(filename);
    else result.others.push(filename);
  }

  for (const filename of fs.readdirSync(VIDEOS_DIR)) {
    const filePath = path.join(VIDEOS_DIR, filename);
    if (fs.statSync(filePath).isDirectory()) continue;
    if (isVideo(filename)) result.videos.push(filename);
    else if (isImage(filename)) result.images.push(filename);
    else result.others.push(filename);
  }

  return result;
}

// Moves all loose files into their appropriate holding folders:
//   /images root  → loose images    → images/loose-images/ (gifs → images/gifs/)
//   /images root  → loose videos    → videos/loose-videos/
//   /images root  → unknown files   → images/loose-files/
//   /videos root  → loose videos    → videos/loose-videos/
//   /videos root  → loose images    → images/loose-images/ (gifs → images/gifs/)
//   /videos root  → unknown files   → videos/loose-files/
//   images/loose-images/ → any gifs → images/gifs/
// Returns a summary of what was moved.
function organizeLooseFiles() {
  ensureDir(IMAGES_DIR);
  ensureDir(VIDEOS_DIR);

  const looseImagesDir = path.join(IMAGES_DIR, 'loose-images');
  const gifsDir        = path.join(IMAGES_DIR, 'gifs');
  const looseVideosDir = path.join(VIDEOS_DIR, 'loose-videos');
  const looseFilesImgDir = path.join(IMAGES_DIR, 'loose-files');
  const looseFilesVidDir = path.join(VIDEOS_DIR, 'loose-files');

  const moved = [];

  function isGif(filename) {
    return path.extname(filename).toLowerCase() === '.gif';
  }

  function moveFile(src, destDir, filename) {
    ensureDir(destDir);
    const dest = path.join(destDir, filename);
    fs.renameSync(src, dest);
    moved.push({ from: src, to: dest });
  }

  // Loose files in /images root
  for (const filename of fs.readdirSync(IMAGES_DIR)) {
    const filePath = path.join(IMAGES_DIR, filename);
    if (fs.statSync(filePath).isDirectory()) continue;
    if (isImage(filename)) moveFile(filePath, isGif(filename) ? gifsDir : looseImagesDir, filename);
    else if (isVideo(filename)) moveFile(filePath, looseVideosDir, filename);
    else moveFile(filePath, looseFilesImgDir, filename);
  }

  // GIFs already sitting in loose-images → move them to gifs/
  if (fs.existsSync(looseImagesDir)) {
    for (const filename of fs.readdirSync(looseImagesDir)) {
      const filePath = path.join(looseImagesDir, filename);
      if (fs.statSync(filePath).isDirectory()) continue;
      if (isGif(filename)) moveFile(filePath, gifsDir, filename);
    }
  }

  // Loose files in /videos root
  for (const filename of fs.readdirSync(VIDEOS_DIR)) {
    const filePath = path.join(VIDEOS_DIR, filename);
    if (fs.statSync(filePath).isDirectory()) continue;
    if (isVideo(filename)) moveFile(filePath, looseVideosDir, filename);
    else if (isImage(filename)) moveFile(filePath, isGif(filename) ? gifsDir : looseImagesDir, filename);
    else moveFile(filePath, looseFilesVidDir, filename);
  }

  return moved;
}

// Deep organize: scans INSIDE every category subfolder for misplaced files.
// Videos found inside /images/** → moved to videos/loose-videos/
// Images found inside /videos/** → moved to images/loose-images/
// Returns summary of moved files.
function organizeDeep() {
  ensureDir(IMAGES_DIR);
  ensureDir(VIDEOS_DIR);

  const looseVideosDir = path.join(VIDEOS_DIR, 'loose-videos');
  const looseImagesDir = path.join(IMAGES_DIR, 'loose-images');
  const moved = [];

  function moveFile(src, destDir, filename) {
    ensureDir(destDir);
    const dest = path.join(destDir, filename);
    // Avoid overwriting — append suffix if needed
    const finalDest = uniqueDest(dest);
    fs.renameSync(src, finalDest);
    moved.push({ from: src, to: finalDest });
  }

  // Walk /images/ — find misplaced videos inside any subfolder
  for (const entry of fs.readdirSync(IMAGES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const catPath = path.join(IMAGES_DIR, entry.name);
    for (const filename of fs.readdirSync(catPath)) {
      const filePath = path.join(catPath, filename);
      if (fs.statSync(filePath).isDirectory()) continue;
      if (isVideo(filename)) moveFile(filePath, looseVideosDir, filename);
    }
  }

  // Walk /videos/ — find misplaced images inside any subfolder
  for (const entry of fs.readdirSync(VIDEOS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const catPath = path.join(VIDEOS_DIR, entry.name);
    for (const filename of fs.readdirSync(catPath)) {
      const filePath = path.join(catPath, filename);
      if (fs.statSync(filePath).isDirectory()) continue;
      if (isImage(filename)) moveFile(filePath, looseImagesDir, filename);
    }
  }

  return moved;
}

function uniqueDest(destPath) {
  if (!fs.existsSync(destPath)) return destPath;
  const ext  = path.extname(destPath);
  const base = destPath.slice(0, -ext.length);
  let i = 1;
  let candidate;
  do { candidate = `${base} (${i++})${ext}`; } while (fs.existsSync(candidate));
  return candidate;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getImagesDir() { return IMAGES_DIR; }
function getVideosDir() { return VIDEOS_DIR; }

module.exports = {
  scanCategories,
  scanCategory,
  scanVideoCategories,
  scanVideoCategory,
  scanAllImages,
  scanLooseFiles,
  organizeLooseFiles,
  organizeDeep,
  getImagesDir,
  getVideosDir,
  isImage,
  isVideo,
};

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../');
const IMAGES_DIR = path.join(ROOT, 'images');
const VIDEOS_DIR = path.join(ROOT, 'videos');
const AUDIO_DIR  = path.join(ROOT, 'audio');
const LOOSE_DIR  = path.join(ROOT, 'loose');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.ogg', '.wav', '.m4a', '.aac', '.opus']);

// Folders inside /images that should never surface as user-facing categories
const HIDDEN_CATEGORIES = new Set(['recycle-bin']);

function isImage(filename) {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function isVideo(filename) {
  return VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function isAudio(filename) {
  return AUDIO_EXTENSIONS.has(path.extname(filename).toLowerCase());
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
    if (HIDDEN_CATEGORIES.has(entry.name)) continue;

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

// Detects loose files sitting directly in /images, /videos, /audio, or /loose root (not in any subfolder).
// Returns { images, videos, audios, others } — each is an array of filenames.
function scanLooseFiles() {
  ensureDir(IMAGES_DIR);
  ensureDir(VIDEOS_DIR);
  ensureDir(AUDIO_DIR);
  ensureDir(LOOSE_DIR);

  const result = { images: [], videos: [], audios: [], others: [] };

  for (const filename of fs.readdirSync(IMAGES_DIR)) {
    const filePath = path.join(IMAGES_DIR, filename);
    if (fs.statSync(filePath).isDirectory()) continue;
    if (isImage(filename)) result.images.push(filename);
    else if (isVideo(filename)) result.videos.push(filename);
    else if (isAudio(filename)) result.audios.push(filename);
    else result.others.push(filename);
  }

  for (const filename of fs.readdirSync(VIDEOS_DIR)) {
    const filePath = path.join(VIDEOS_DIR, filename);
    if (fs.statSync(filePath).isDirectory()) continue;
    if (isVideo(filename)) result.videos.push(filename);
    else if (isImage(filename)) result.images.push(filename);
    else if (isAudio(filename)) result.audios.push(filename);
    else result.others.push(filename);
  }

  for (const filename of fs.readdirSync(AUDIO_DIR)) {
    const filePath = path.join(AUDIO_DIR, filename);
    if (fs.statSync(filePath).isDirectory()) continue;
    if (isAudio(filename)) result.audios.push(filename);
    else if (isImage(filename)) result.images.push(filename);
    else if (isVideo(filename)) result.videos.push(filename);
    else result.others.push(filename);
  }

  for (const filename of fs.readdirSync(LOOSE_DIR)) {
    const filePath = path.join(LOOSE_DIR, filename);
    if (fs.statSync(filePath).isDirectory()) continue;
    if (isImage(filename)) result.images.push(filename);
    else if (isVideo(filename)) result.videos.push(filename);
    else if (isAudio(filename)) result.audios.push(filename);
    else result.others.push(filename);
  }

  return result;
}

// Moves all loose files into their appropriate holding folders.
// Media-root passes (files sitting directly in images/, videos/, audio/):
//   image  → images/loose-images/ (gifs → images/gifs/)
//   video  → videos/loose-videos/
//   audio  → audio/loose-audio/
//   other  → <same-root>/loose-files/
// Drop-zone pass (anything dropped in /loose):
//   image  → images/loose-images/ (gifs → images/gifs/)
//   video  → videos/loose-videos/
//   audio  → audio/loose-audio/
//   other  → stays in loose/ (unrecognised format)
// Cross-check pass (re-scans each loose holding folder for wrong-type files):
//   loose-images/ → videos → loose-videos/, audio → loose-audio/, gifs → gifs/
//   loose-videos/ → images → loose-images/ (gifs → gifs/), audio → loose-audio/
//   loose-audio/  → images → loose-images/ (gifs → gifs/), videos → loose-videos/
// Returns a summary of what was moved.
function organizeLooseFiles() {
  ensureDir(IMAGES_DIR);
  ensureDir(VIDEOS_DIR);
  ensureDir(AUDIO_DIR);
  ensureDir(LOOSE_DIR);

  const looseImagesDir   = path.join(IMAGES_DIR, 'loose-images');
  const gifsDir          = path.join(IMAGES_DIR, 'gifs');
  const looseVideosDir   = path.join(VIDEOS_DIR, 'loose-videos');
  const looseAudioDir    = path.join(AUDIO_DIR,  'loose-audio');
  const looseFilesImgDir = path.join(IMAGES_DIR, 'loose-files');
  const looseFilesVidDir = path.join(VIDEOS_DIR, 'loose-files');
  const looseFilesAudDir = path.join(AUDIO_DIR,  'loose-files');

  const moved = [];

  function isGif(filename) {
    return path.extname(filename).toLowerCase() === '.gif';
  }

  function moveFile(src, destDir, filename) {
    ensureDir(destDir);
    const dest = uniqueDest(path.join(destDir, filename));
    fs.renameSync(src, dest);
    moved.push({ from: src, to: dest });
  }

  // Loose files in /images root
  for (const filename of fs.readdirSync(IMAGES_DIR)) {
    const filePath = path.join(IMAGES_DIR, filename);
    if (fs.statSync(filePath).isDirectory()) continue;
    if (isImage(filename)) moveFile(filePath, isGif(filename) ? gifsDir : looseImagesDir, filename);
    else if (isVideo(filename)) moveFile(filePath, looseVideosDir, filename);
    else if (isAudio(filename)) moveFile(filePath, looseAudioDir, filename);
    else moveFile(filePath, looseFilesImgDir, filename);
  }

  // Loose files in /videos root
  for (const filename of fs.readdirSync(VIDEOS_DIR)) {
    const filePath = path.join(VIDEOS_DIR, filename);
    if (fs.statSync(filePath).isDirectory()) continue;
    if (isVideo(filename)) moveFile(filePath, looseVideosDir, filename);
    else if (isImage(filename)) moveFile(filePath, isGif(filename) ? gifsDir : looseImagesDir, filename);
    else if (isAudio(filename)) moveFile(filePath, looseAudioDir, filename);
    else moveFile(filePath, looseFilesVidDir, filename);
  }

  // Loose files in /audio root
  for (const filename of fs.readdirSync(AUDIO_DIR)) {
    const filePath = path.join(AUDIO_DIR, filename);
    if (fs.statSync(filePath).isDirectory()) continue;
    if (isAudio(filename)) moveFile(filePath, looseAudioDir, filename);
    else if (isImage(filename)) moveFile(filePath, isGif(filename) ? gifsDir : looseImagesDir, filename);
    else if (isVideo(filename)) moveFile(filePath, looseVideosDir, filename);
    else moveFile(filePath, looseFilesAudDir, filename);
  }

  // Files dropped in /loose — route to the right holding dir, leave unknowns in place
  for (const filename of fs.readdirSync(LOOSE_DIR)) {
    const filePath = path.join(LOOSE_DIR, filename);
    if (fs.statSync(filePath).isDirectory()) continue;
    if (isImage(filename)) moveFile(filePath, isGif(filename) ? gifsDir : looseImagesDir, filename);
    else if (isVideo(filename)) moveFile(filePath, looseVideosDir, filename);
    else if (isAudio(filename)) moveFile(filePath, looseAudioDir, filename);
  }

  // Cross-check: loose-images/ for wrong-type files and gifs that need promoting
  if (fs.existsSync(looseImagesDir)) {
    for (const filename of fs.readdirSync(looseImagesDir)) {
      const filePath = path.join(looseImagesDir, filename);
      if (fs.statSync(filePath).isDirectory()) continue;
      if (isGif(filename)) moveFile(filePath, gifsDir, filename);
      else if (isVideo(filename)) moveFile(filePath, looseVideosDir, filename);
      else if (isAudio(filename)) moveFile(filePath, looseAudioDir, filename);
    }
  }

  // Cross-check: loose-videos/ for wrong-type files
  if (fs.existsSync(looseVideosDir)) {
    for (const filename of fs.readdirSync(looseVideosDir)) {
      const filePath = path.join(looseVideosDir, filename);
      if (fs.statSync(filePath).isDirectory()) continue;
      if (isImage(filename)) moveFile(filePath, isGif(filename) ? gifsDir : looseImagesDir, filename);
      else if (isAudio(filename)) moveFile(filePath, looseAudioDir, filename);
    }
  }

  // Cross-check: loose-audio/ for wrong-type files
  if (fs.existsSync(looseAudioDir)) {
    for (const filename of fs.readdirSync(looseAudioDir)) {
      const filePath = path.join(looseAudioDir, filename);
      if (fs.statSync(filePath).isDirectory()) continue;
      if (isImage(filename)) moveFile(filePath, isGif(filename) ? gifsDir : looseImagesDir, filename);
      else if (isVideo(filename)) moveFile(filePath, looseVideosDir, filename);
    }
  }

  return moved;
}

// Deep organize: scans INSIDE every category subfolder for misplaced files.
// Videos found inside /images/**  → moved to videos/loose-videos/
// Audio  found inside /images/**  → moved to audio/loose-audio/
// Images found inside /videos/**  → moved to images/loose-images/
// Audio  found inside /videos/**  → moved to audio/loose-audio/
// Images found inside /audio/**   → moved to images/loose-images/
// Videos found inside /audio/**   → moved to videos/loose-videos/
// Returns summary of moved files.
function organizeDeep() {
  ensureDir(IMAGES_DIR);
  ensureDir(VIDEOS_DIR);
  ensureDir(AUDIO_DIR);

  const looseVideosDir = path.join(VIDEOS_DIR, 'loose-videos');
  const looseImagesDir = path.join(IMAGES_DIR, 'loose-images');
  const looseAudioDir  = path.join(AUDIO_DIR,  'loose-audio');
  const moved = [];

  function moveFile(src, destDir, filename) {
    ensureDir(destDir);
    const dest = path.join(destDir, filename);
    // Avoid overwriting — append suffix if needed
    const finalDest = uniqueDest(dest);
    fs.renameSync(src, finalDest);
    moved.push({ from: src, to: finalDest });
  }

  // Walk /images/ — find misplaced videos and audio inside any subfolder
  for (const entry of fs.readdirSync(IMAGES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const catPath = path.join(IMAGES_DIR, entry.name);
    for (const filename of fs.readdirSync(catPath)) {
      const filePath = path.join(catPath, filename);
      if (fs.statSync(filePath).isDirectory()) continue;
      if (isVideo(filename)) moveFile(filePath, looseVideosDir, filename);
      else if (isAudio(filename)) moveFile(filePath, looseAudioDir, filename);
    }
  }

  // Walk /videos/ — find misplaced images and audio inside any subfolder
  for (const entry of fs.readdirSync(VIDEOS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const catPath = path.join(VIDEOS_DIR, entry.name);
    for (const filename of fs.readdirSync(catPath)) {
      const filePath = path.join(catPath, filename);
      if (fs.statSync(filePath).isDirectory()) continue;
      if (isImage(filename)) moveFile(filePath, looseImagesDir, filename);
      else if (isAudio(filename)) moveFile(filePath, looseAudioDir, filename);
    }
  }

  // Walk /audio/ — find misplaced images and videos inside any subfolder
  for (const entry of fs.readdirSync(AUDIO_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const catPath = path.join(AUDIO_DIR, entry.name);
    for (const filename of fs.readdirSync(catPath)) {
      const filePath = path.join(catPath, filename);
      if (fs.statSync(filePath).isDirectory()) continue;
      if (isImage(filename)) moveFile(filePath, looseImagesDir, filename);
      else if (isVideo(filename)) moveFile(filePath, looseVideosDir, filename);
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

function scanAudioCategories() {
  ensureDir(AUDIO_DIR);
  const entries = fs.readdirSync(AUDIO_DIR, { withFileTypes: true });
  const categories = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (HIDDEN_CATEGORIES.has(entry.name)) continue;
    const categoryPath = path.join(AUDIO_DIR, entry.name);
    const files = fs.readdirSync(categoryPath).filter(isAudio);
    categories.push({ name: entry.name, trackCount: files.length });
  }
  return categories;
}

function scanAudioCategory(categoryName) {
  const categoryPath = path.join(AUDIO_DIR, categoryName);
  if (!fs.existsSync(categoryPath)) return null;
  const files = fs.readdirSync(categoryPath).filter(isAudio);
  return files.map(filename =>
    getFileInfo(path.join(categoryPath, filename), categoryName, 'audio')
  );
}

function scanAllAudio() {
  ensureDir(AUDIO_DIR);
  const entries = fs.readdirSync(AUDIO_DIR, { withFileTypes: true });
  const all = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (HIDDEN_CATEGORIES.has(entry.name)) continue;
    const categoryPath = path.join(AUDIO_DIR, entry.name);
    for (const filename of fs.readdirSync(categoryPath).filter(isAudio)) {
      all.push(getFileInfo(path.join(categoryPath, filename), entry.name, 'audio'));
    }
  }
  return all;
}

function getImagesDir() { return IMAGES_DIR; }
function getVideosDir() { return VIDEOS_DIR; }
function getAudioDir()  { return AUDIO_DIR; }
function getLooseDir()  { return LOOSE_DIR; }

module.exports = {
  scanCategories,
  scanCategory,
  scanVideoCategories,
  scanVideoCategory,
  scanAllImages,
  scanAudioCategories,
  scanAudioCategory,
  scanAllAudio,
  scanLooseFiles,
  organizeLooseFiles,
  organizeDeep,
  getImagesDir,
  getVideosDir,
  getAudioDir,
  getLooseDir,
  isImage,
  isVideo,
  isAudio,
};

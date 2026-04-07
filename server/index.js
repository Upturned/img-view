const express = require('express');
const path = require('path');
const { generateAllThumbs, getThumbnailsDir } = require('./utils/thumbnails');

const app = express();
const PORT = process.env.PORT || 2080;

// --- Middleware ---
app.use(express.json());

// --- Static: client files ---
app.use(express.static(path.join(__dirname, '../client')));

// --- Static: images, videos, thumbnails ---
app.use('/images', express.static(path.join(__dirname, '../images')));
app.use('/videos', express.static(path.join(__dirname, '../videos')));
app.use('/thumbnails', express.static(getThumbnailsDir()));

// --- API Routes ---
app.use('/api/categories', require('./routes/categories'));
app.use('/api/videos',     require('./routes/videos'));
app.use('/api/tags',       require('./routes/tags'));
app.use('/api/search',     require('./routes/search'));
app.use('/api/random',     require('./routes/random'));
app.use('/api/open',       require('./routes/open'));
app.use('/api/files',      require('./routes/files'));
app.use('/api/favorites',  require('./routes/favorites'));
app.use('/api/recycle',    require('./routes/recycle'));

// --- Fallback: serve home page for unmatched routes ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/pages/home.html'));
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`img-view running at http://localhost:${PORT}`);
  console.log('Scanning for missing thumbnails in the background...');
  generateAllThumbs().catch(err =>
    console.error('[thumbnails] Background generation error:', err.message)
  );
});

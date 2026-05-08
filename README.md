# img-view

A local media manager. Drop your files into category folders, start the server, and browse at `localhost:2080`. Organised into **sides** — Images, Videos, Audio, with Text-Writer planned — all accessible from a central hub. Built with Node.js + Express and vanilla HTML/CSS/JS — no build step, runs fully offline.

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or later

## Setup

```bash
npm install
```

## Running

```bash
npm start
```

Then open **http://localhost:2080** in your browser.

On Windows, double-click `launch.bat` to start the server and open the browser automatically.

For development with auto-restart on file changes:

```bash
npm run dev
```

---

## Organizing your files

```
img-view/
├── images/
│   └── category-name/
│       ├── photo.jpg
│       └── ...
├── videos/
│   └── category-name/
│       ├── clip.mp4
│       └── ...
└── audio/
    └── category-name/
        ├── song.mp3
        └── ...
```

- Each subfolder inside `images/`, `videos/`, or `audio/` becomes a **category**.
- Supported image formats: JPG, JPEG, PNG, GIF, WebP, SVG, AVIF
- Supported video formats: MP4, WebM
- Supported audio formats: MP3, FLAC, OGG, WAV, M4A, AAC, OPUS
- Loose files dropped directly into `images/` or `videos/` can be auto-organized from the navbar.

---

## Features

### Navigation
- Central **hub page** (`/pages/hub.html`) with a card for each side of the app
- Logo in every page links back to the hub
- Sides currently available: **Images**, **Videos**, **Audio**
- Sides planned: **Text-Writer**

### Image browsing
- Category grid on the home page with cover thumbnails
- Lazy-loaded image grid with adjustable column count (2–10), persisted across sessions
- Sort by name, date modified, or random; ascending or descending
- Filter by favorites, tags, or filename text — all filters stack
- Right-click context menus on cards for quick actions
- Selection mode for bulk move, copy, or recycle

### Image viewer
- Zoom (0.1×–10×) and pan with scroll wheel + click-drag
- Viewport-constrained pan (no empty space shown)
- Previous/Next navigation following current sort order
- Slideshow mode with configurable interval (1–30 s) and animated progress bar
- Fullscreen mode
- Inline tag editing with searchable picker
- Favorites (★) and recycle bin (🗑) buttons
- Open With button (Windows native file association)

### Video management
- Video category grid with count badges and adjustable columns
- Selection mode for bulk move, copy, or recycle
- Right-click context menus on video cards

### Video player
- Native HTML5 video player with prev/next navigation
- **Zoom (0.1×–10×) and pan** — scroll to zoom, click-drag to pan; short clicks still reach native controls
- Auto-advance to next video on playback end
- Sidebar with clickable video list thumbnails
- Inline tag editing with searchable picker (same as image viewer)
- Recycle bin button
- Open With button

### Audio
- Category grid → track list with a persistent player bar at the bottom of the page
- Play/pause, previous/next, seek, volume, mute
- Auto-advances to the next track on playback end
- Favorites and tag editing from the player bar
- Recycle bin support
- Supported formats: MP3, FLAC, OGG, WAV, M4A, AAC, OPUS

### Tagging
- Tags stored in `data/imgview.db` (SQLite) — survive moves and renames
- Unified tag picker in image, video, and audio — current tags + searchable chip picker + "+ New tag"
- Batch-add a tag to multiple files at once
- Tag sidebar on all main pages: filter by tag, sort by name or count, count badges
- `#tagname` syntax in the search bar for inline tag filtering

### Search
- Global search across all images and categories by filename
- Tag filtering in search results (AND logic for multiple tags)
- Results grouped into Images and Categories tabs

### Favorites & Recycle bin
- Star any image, video, or audio track; favorites stored in `data/imgview.db`
- Filter by favorites on each side
- Recycle bins: `images/recycle-bin/`, `videos/recycle-bin/`, `audio/recycle-bin/` — restore or permanently delete from the UI
- Favorited files are protected from accidental recycling

### File operations
- Move, copy, or rename files between categories (single and bulk)
- Windows file picker to add files to a category directly from the UI
- Detect and auto-organize loose files into appropriate category folders
- Deep organize: scan inside categories for misplaced file types
- Stale thumbnail cleanup

### Thumbnails
- Server-side generation via Sharp — 300 px max-width, 80% WebP quality
- Generated once, cached to `thumbnails/`, skipped on reload
- Background generation at startup — doesn't block the UI

### Themes
- Four themes: **Modern** (default dark), **Minimal**, **Warm**, **High Contrast**
- Click the theme button in the navbar to cycle through them
- Selection persists via localStorage; injected before DOM load to avoid flash

---

## Keyboard shortcuts

### Image viewer
| Key | Action |
|-----|--------|
| `←` / `→` | Previous / Next image |
| `Backspace` | Go back |
| `R` | Random image |
| `F` | Toggle fullscreen |
| `+` / `-` | Zoom in / out |
| `0` | Reset zoom |
| `Esc` | Exit fullscreen / stop slideshow |

### Video player
| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` / `→` | Seek ±5 seconds |
| `↑` / `↓` | Volume ±10% |
| `M` | Mute toggle |
| `F` | Toggle fullscreen |
| `+` / `-` | Zoom in / out |
| `0` | Reset zoom |
| `Backspace` | Go back |

### Audio player
| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `Alt+←` | Previous track |
| `Alt+→` | Next track |
| `M` | Mute toggle |

---

## Data

All persistent metadata (tags, favorites) is stored in a local SQLite database:

| File | Contents |
|------|----------|
| `data/imgview.db` | Tags, favorites, and file metadata |

The database is created automatically on first run. If you have an existing install with the old JSON files (`data/tags-images.json`, `data/tags-videos.json`, `data/favorites.json`), they are imported into the database automatically on first startup and can then be deleted.

All files under `data/`, `thumbnails/`, and `images/` are excluded from git.

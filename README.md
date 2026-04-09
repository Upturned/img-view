# img-view

A local image and video manager. Drop your files into category folders, start the server, and browse at `localhost:2080`. Built with Node.js + Express and vanilla HTML/CSS/JS — no build step, no external deps, runs fully offline.

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
│   ├── category-name/
│   │   ├── photo.jpg
│   │   └── ...
│   └── another-category/
└── videos/
    └── category-name/
        ├── clip.mp4
        └── ...
```

- Each subfolder inside `images/` or `videos/` becomes a **category**.
- Supported image formats: JPG, JPEG, PNG, GIF, WebP, SVG, AVIF
- Supported video formats: MP4, WebM
- Loose files dropped directly into `images/` or `videos/` can be auto-organized from the home page.

---

## Features

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

### Tagging
- Tags stored in `data/tags-images.json` and `data/tags-videos.json`
- Unified tag picker in both image and video viewers: current tags + searchable chip picker for all existing tags + "+ New tag"
- Batch-add a tag to multiple files at once
- Tag sidebar on home and category pages: filter by tag, sort by name or count, count badges
- `#tagname` syntax in the search bar for inline tag filtering

### Search
- Global search across all images and categories by filename
- Tag filtering in search results (AND logic for multiple tags)
- Results grouped into Images and Categories tabs

### Favorites & Recycle bin
- Star any image; favorites persist in `data/favorites.json`
- Filter category view or home grid to show only favorites
- Image recycle bin: `images/recycle-bin/` — restore or permanently delete from the UI
- Video recycle bin: `videos/recycle-bin/` — same restore/delete UI
- Favorited images are protected from accidental recycling

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

---

## Data files

| File | Contents |
|------|----------|
| `data/favorites.json` | `{ "category/filename": true }` |
| `data/tags-images.json` | `{ "category/filename": ["tag1", "tag2"] }` |
| `data/tags-videos.json` | Same structure for videos |

These are excluded from git by default. `thumbnails/` and `images/` are also gitignored.

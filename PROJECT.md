# img-view — Project Documentation

## Overview

A local media manager running as a Node.js + Express server with a plain HTML/CSS/JS frontend.
Organised into **sides** (Images, Videos, Audio, with Text-Writer planned), each accessible from a central hub page.
Designed for offline, desktop-only use. No internet connection required at runtime. No build step.

---

## Requirements

### File Handling
- Automatically reads `/images` and `/videos` folders — no manual folder selection.
- Categories are subfolders inside `/images` and `/videos`.
- Users can create new categories from the UI.
- Loose files (in root, not in a subfolder) can be auto-organized into appropriate categories.
- Deep organize: scans inside categories for misplaced file types.
- Windows file picker for manually adding files to a category.
- Move, copy, rename (single and bulk) between categories.
- Recycle bin: moves files to a hidden folder; restore or delete permanently from UI.

### Navigation model
- The app is divided into **sides**: Images, Videos, Audio, Text-Writer (planned).
- `/pages/hub.html` is the entry point — a card grid with one card per side.
- The logo in every page navbar links back to the hub.
- Each side owns its own pages, routes, and data. The shared navbar (`navbar.js`) only contains the Organize button; side-switching happens through the hub.

### Themes & UI
- Desktop only — no mobile/responsive requirement.
- Four themes:
  - **Modern** — dark, card-based (default)
  - **Minimal** — clean, lots of whitespace, simple typography
  - **Warm** — warm-toned variant
  - **High Contrast** — accessibility-focused
- Theme switcher in navbar cycles through all four; persists via localStorage.
- Theme CSS injected before DOM load to prevent flash of unstyled content.

### Supported Formats
- Images: JPG, JPEG, PNG, GIF (animated), WebP, SVG, AVIF
- Videos: MP4, WebM
- Audio: MP3, FLAC, OGG, WAV, M4A, AAC, OPUS
- PDFs: not supported

### Search
- Search by file name, folder name, and tags.
- `#tagname` syntax in search bar for inline tag filtering.
- Cross-category search results with Images and Categories tabs.
- Tag filtering uses AND logic for multiple tags.

### Tags
- Stored in `data/imgview.db` (SQLite, `file_tags` + `tags` tables).
- Tags survive file moves and renames — the DB row is updated atomically with the disk operation.
- Add, remove, and search tags inline in the image, video, and audio viewers.
- Batch-add: apply one tag to multiple files at once.
- Tag sidebar on all main pages — search chips, sort by name or count, count badges.

### Sorting & Filtering (Category Page)
- Sort by: name, date modified, random; ascending or descending.
- Filter by: favorites, tags (AND), filename text — all filters stack.
- Adjustable column count (2–10); persists via localStorage.

### Favorites
- Toggle star on any image, video, or audio track; stored in `data/imgview.db` (`files.favorited` column).
- Favorites filter available on each side.
- Star badge (★) on favorited cards; star button in the audio player bar.
- Favorited files (any type) are protected from accidental recycling.

### Image Viewer
- Default: natural size, fit-to-screen if image exceeds viewport.
- Zoom 0.1×–10× via scroll wheel; click-drag to pan.
- Viewport-constrained pan — no empty space shown.
- Prev/Next navigation following current sort order.
- Keyboard shortcuts:
  - `←` / `→` — previous / next image
  - `Backspace` — go back
  - `R` — random image
  - `F` — fullscreen
  - `+` / `-` — zoom in / out
  - `0` — reset zoom
  - `Esc` — exit fullscreen / stop slideshow
- Slideshow mode: configurable interval (1–30 s), animated progress bar.
- Inline tag editing, Open With button (Windows native dialog).

### Video Section
- Separate from image section; same category structure under `/videos`.
- Native HTML5 `<video>` player with prev/next navigation.
- Auto-advance to next video on playback end.
- Sidebar with clickable video list thumbnails.
- Tag support and Open With button.
- Keyboard shortcuts:
  - `Space` — play/pause
  - `←` / `→` — seek ±5 seconds
  - `↑` / `↓` — volume ±10%
  - `M` — mute toggle
  - `F` — fullscreen
  - `Backspace` — go back

### Audio Section
- Category structure under `/audio`; same category/recycle/favorites model as images and videos.
- Persistent player bar fixed at the bottom of the page — stays active while browsing categories and track lists.
- Track list view (list rows, not a card grid — audio has no visual thumbnail).
- Tag picker panel slides up above the player bar.
- Keyboard shortcuts:
  - `Space` — play/pause
  - `Alt+←` / `Alt+→` — previous / next track
  - `M` — mute toggle

### Random
- Random image: from all images, a specific category, or a specific tag.
- Random video: from all videos or a specific category.
- Random audio: from all tracks or a specific category.
- Exclude current file to avoid repeats.

### Performance
- Target: up to ~15,000 images.
- Thumbnails generated server-side via Sharp — 300 px max-width, 80% WebP quality.
- Cached to `/thumbnails`; only generated once, skipped if cached.
- Background thumbnail generation at startup (concurrency cap: 8).
- Lazy loading via IntersectionObserver on all grids.
- Client-side filtering for instant feedback after data is loaded.

### Offline
- 100% offline at runtime. No CDN resources, no external fonts, no network calls.
- `sharp` requires network only during `npm install`, not at runtime.

---

## Architecture

### Stack

| Layer      | Choice            | Reason                                              |
|------------|-------------------|-----------------------------------------------------|
| Backend    | Node.js + Express | Local filesystem access, thumbnail gen, open-with   |
| Frontend   | HTML + CSS + JS   | No build step, no framework overhead                |
| Thumbnails | `sharp`           | Fast, offline, battle-tested                        |
| Data       | SQLite (`better-sqlite3`) | Single file, transactional writes, survives moves |
| Language   | JavaScript        | No TypeScript build step needed at this scale       |

### Notable patterns
- **Stateless server** — no in-memory state; metadata lives in `data/imgview.db`, media files on disk.
- **sessionStorage for navigation** — image/video lists stored in sessionStorage to preserve sort order across page transitions.
- **Client-side filtering** — server returns sorted list; filters (tags, favorites, name) applied in browser.
- **Hub + sides model** — `hub.html` is the entry point; each side (Images, Videos, …) is a self-contained set of pages. The shared navbar only contains Organize; side-switching always goes through the hub.
- **Tag sidebar** — reusable `createTagSidebar()` factory used on all main pages; accepts a `type` param so each side filters its own tags.
- **Context menu system** — centralized right-click handler with category picker modal for file operations.
- **Path traversal protection** — all file operations validated with `path.resolve()`.
- **Hidden categories** — `recycle-bin` folder excluded from UI via `HIDDEN_CATEGORIES` set in `scanner.js`.

---

## Folder Structure

```
img-view/
├── server/
│   ├── index.js                    # Express setup, middleware, routes, thumbnail gen at startup
│   ├── routes/
│   │   ├── categories.js           # GET/POST image categories; GET with sort/filter
│   │   ├── videos.js               # GET/POST video categories; GET videos by category
│   │   ├── audio.js                # GET/POST audio categories; GET tracks by category; GET random
│   │   ├── tags.js                 # Tag CRUD (individual, batch-add, all-tags with counts)
│   │   ├── search.js               # Cross-category search by filename + tag
│   │   ├── random.js               # Random image/video (category/tag/exclude filters)
│   │   ├── files.js                # Move, copy, rename, organize, pick, cleanup thumbs
│   │   ├── favorites.js            # Toggle and retrieve favorites
│   │   ├── recycle.js              # Recycle bin (move, restore, delete permanently)
│   │   └── open.js                 # Windows "Open With" dialog
│   └── utils/
│       ├── scanner.js              # Filesystem scanning (categories, images, videos, audio, loose files)
│       ├── thumbnails.js           # Sharp thumbnail generation and caching
│       └── db.js                   # SQLite connection, migrations, seed-from-JSON, shared helpers
├── client/
│   ├── index.html                  # Redirect to /pages/hub.html
│   ├── pages/
│   │   ├── hub.html                # Entry point — side selector (Images, Videos, Audio, Text-Writer)
│   │   ├── home.html               # Images side — category grid, search, favorites, recycle bin modal
│   │   ├── category.html           # Image grid with sort, filter, size slider
│   │   ├── image.html              # Image viewer (zoom/pan, nav, slideshow, tags)
│   │   ├── videos.html             # Videos side — category grid + video list
│   │   ├── video.html              # Video player with sidebar and tags
│   │   ├── audio.html              # Audio side — category grid + track list + player bar
│   │   └── search.html             # Global search results
│   ├── css/
│   │   ├── base.css                # Reset, layout, shared components
│   │   ├── theme-modern.css        # Default dark theme
│   │   ├── theme-minimal.css       # Minimal light theme
│   │   ├── theme-warm.css          # Warm tones theme
│   │   └── theme-highcontrast.css  # High contrast theme
│   └── js/
│       ├── api.js                  # All fetch wrappers + toast notification system
│       ├── home.js                 # Home page logic
│       ├── category.js             # Category page (grid, sort, filter, selection, bulk ops)
│       ├── image.js                # Image viewer (zoom/pan, nav, slideshow, keyboard)
│       ├── videos.js               # Videos page (category grid + video list)
│       ├── video.js                # Video player (playback, nav, sidebar, tags, keyboard)
│       ├── audio.js                # Audio page (category grid, track list, player bar, tags, keyboard)
│       ├── search.js               # Search results page
│       ├── theme.js                # Theme cycling + localStorage persistence
│       ├── context-menu.js         # Right-click menu system + category picker modal
│       ├── tag-sidebar.js          # Reusable tag sidebar component
│       └── navbar.js               # Shared navbar — Organize button (included on every page)
├── data/
│   └── imgview.db                  # SQLite database — tags, favorites, file metadata (do not commit)
│   # Legacy JSON files (tags-images.json, tags-videos.json, favorites.json) are imported
│   # automatically on first run if present, then can be deleted.
├── images/                         # Image library (subfolders = categories; do not commit)
├── videos/                         # Video library (subfolders = categories; do not commit)
├── audio/                          # Audio library (subfolders = categories; do not commit)
├── thumbnails/                     # Auto-generated thumbnails (do not commit)
├── package.json
├── package-lock.json
├── launch.bat                      # Windows launcher (start server + open browser)
└── .gitignore
```

---

## API Surface

### Categories (Images)
| Method | Endpoint                              | Description                             |
|--------|---------------------------------------|-----------------------------------------|
| GET    | `/api/categories`                     | List all image categories               |
| POST   | `/api/categories`                     | Create a new image category             |
| GET    | `/api/categories/:name`               | Images in category (sort/filter/tags)   |
| POST   | `/api/categories/:name/thumbnails`    | Trigger thumbnail generation            |

### Videos
| Method | Endpoint                              | Description                             |
|--------|---------------------------------------|-----------------------------------------|
| GET    | `/api/videos/categories`             | List all video categories               |
| POST   | `/api/videos/categories`             | Create a new video category             |
| GET    | `/api/videos/:name`                  | Videos in category (sort/order)         |

### Audio
| Method | Endpoint                              | Description                             |
|--------|---------------------------------------|-----------------------------------------|
| GET    | `/api/audio/categories`              | List all audio categories               |
| POST   | `/api/audio/categories`              | Create a new audio category             |
| GET    | `/api/audio/random`                  | Random track (category/exclude filters) |
| GET    | `/api/audio/:name`                   | Tracks in category (sort/order)         |

### Tags
| Method | Endpoint                              | Description                             |
|--------|---------------------------------------|-----------------------------------------|
| GET    | `/api/tags?type=image\|video\|audio`  | Full tags map                           |
| GET    | `/api/tags/all?category=&type=`       | Sorted tag list with counts             |
| GET    | `/api/tags/:category/:filename`       | Tags for one file                       |
| POST   | `/api/tags/:category/:filename`       | Set tags for one file                   |
| DELETE | `/api/tags/:category/:filename`       | Clear tags for one file                 |
| POST   | `/api/tags/batch-add`                 | Add a tag to multiple files             |

### Search
| Method | Endpoint                              | Description                             |
|--------|---------------------------------------|-----------------------------------------|
| GET    | `/api/search?q=&tags=&type=`          | Cross-category search by name + tag     |

### Random
| Method | Endpoint                              | Description                             |
|--------|---------------------------------------|-----------------------------------------|
| GET    | `/api/random?category=&tag=&exclude=` | Random image                            |
| GET    | `/api/random/video?category=&exclude=`| Random video                            |
| GET    | `/api/audio/random?category=&exclude=`| Random audio track                      |

### Files
| Method | Endpoint                              | Description                             |
|--------|---------------------------------------|-----------------------------------------|
| POST   | `/api/files/move`                     | Move file between categories            |
| POST   | `/api/files/copy`                     | Copy file between categories            |
| POST   | `/api/files/move-bulk`                | Move multiple files                     |
| POST   | `/api/files/copy-bulk`                | Copy multiple files                     |
| POST   | `/api/files/rename`                   | Rename a file                           |
| GET    | `/api/files/loose`                    | Detect loose files                      |
| POST   | `/api/files/organize-loose`           | Organize loose files into categories    |
| POST   | `/api/files/organize-deep`            | Organize misplaced files inside cats    |
| POST   | `/api/files/pick`                     | Open Windows file picker                |
| POST   | `/api/files/cleanup-thumbs`           | Delete stale thumbnails                 |

### Favorites
| Method | Endpoint                              | Description                             |
|--------|---------------------------------------|-----------------------------------------|
| GET    | `/api/favorites`                      | Full favorites map                      |
| POST   | `/api/favorites/:category/:filename`  | Toggle favorite (`?type=image\|video\|audio`) |

### Recycle Bin
| Method | Endpoint                              | Description                             |
|--------|---------------------------------------|-----------------------------------------|
| GET    | `/api/recycle`                        | List files in recycle bin               |
| POST   | `/api/recycle/:category/:filename`    | Move file to recycle bin                |
| DELETE | `/api/recycle/:filename`              | Permanently delete from recycle bin     |
| POST   | `/api/recycle/restore/:filename`      | Restore to loose folder (`?type=image\|video\|audio`) |

### Open With
| Method | Endpoint                              | Description                             |
|--------|---------------------------------------|-----------------------------------------|
| POST   | `/api/open`                           | Trigger Windows "Open With" dialog      |

### Static
| Route                              | Description                              |
|------------------------------------|------------------------------------------|
| `/images/:category/:filename`      | Serve full-resolution image              |
| `/videos/:category/:filename`      | Serve video file                         |
| `/audio/:category/:filename`       | Serve audio file                         |
| `/thumbnails/:category/:filename`  | Serve cached WebP thumbnail              |

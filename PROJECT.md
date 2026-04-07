# Image Visualizer — Project Documentation

## Overview

A local image (and video) visualizer running as a Node.js server with a plain HTML/CSS/JS frontend.
Designed for offline use only. No internet connection required at runtime.

---

## Requirements Summary (Interview)

### File Handling
- The app automatically reads the `/images` and `/videos` folders on startup — no manual folder selection.
- Categories are subfolders inside `/images` and `/videos`.
- Users can create new categories (folders) from within the app.
- Images and tags are managed through the app UI; files are managed manually through the filesystem.

### Themes & UI
- Desktop only (no mobile/responsive requirement).
- Two dark themes:
  - **Minimal** — clean, lots of whitespace, simple typography
  - **Modern** — richer card-based design
- Theme switcher available in the UI.

### Supported Formats
- Images: JPG, JPEG, PNG, GIF (animated), WebP, SVG, AVIF
- Videos: MP4, WebM
- PDFs: not supported

### Search
- Search by file name, folder name, and tags.
- Tags are stored in a local `data/tags.json` file (no external database).
- Tags can be added/edited from the image view page.
- Search works across categories.

### Sorting & Filtering (Category Page)
- Sort by: name, date modified, random
- Filter by: tags
- Adjustable card/thumbnail size (affects columns per row)

### Image View Page
- Default display: natural size, unless larger than viewport (then fit-to-screen).
- Manual zoom via scroll wheel.
- Pan/drag when image is zoomed beyond screen bounds.
- Next / Previous navigation following the current sort order.
- Keyboard shortcuts:
  - `←` / `→` — previous / next image
  - `Backspace` — go back
  - `R` — random image
  - `F` — fullscreen
  - `Esc` — exit fullscreen / go back
- Tag editing directly on this page.
- "Open With" button — triggers Windows native Open With dialog.

### Random Image
- Central feature of the app.
- Three modes:
  - Random from all images
  - Random from a specific category
  - Random from a specific tag

### Slideshow
- Available on the image view page.
- Configurable interval (user-settable time between slides).

### Video Section
- Separate from the image section.
- Same category structure (`/videos` folder with subfolders).
- Simple built-in video player using the browser's native `<video>` element.

### Performance
- Target: up to ~15,000 images.
- Thumbnails generated server-side using `sharp`, cached to `/thumbnails`.
- Thumbnails are only generated once (skipped if already cached).
- Lazy loading and virtual scrolling on the frontend for large collections.

### Offline
- 100% offline at runtime. No CDN resources, no external fonts, no network calls.
- `sharp` requires network only during `npm install`, not at runtime.

---

## Proposed Architecture

### Stack

| Layer      | Choice              | Reason                                              |
|------------|---------------------|-----------------------------------------------------|
| Backend    | Node.js + Express   | Local filesystem access, thumbnail gen, open-with   |
| Frontend   | HTML + CSS + JS     | No build step, no framework overhead                |
| Thumbnails | `sharp`             | Fast, offline, battle-tested                        |
| Data       | `tags.json`         | Zero dependencies, human-readable                   |
| Language   | JavaScript          | No TypeScript build step needed at this scale       |

---

## Folder Structure

```
img-view/
├── server/
│   ├── index.js              # Entry point, Express setup
│   ├── routes/
│   │   ├── categories.js     # List/create image categories
│   │   ├── images.js         # List images, serve files
│   │   ├── videos.js         # List videos, serve files
│   │   ├── tags.js           # Read/write tags.json
│   │   ├── search.js         # Search by name/tag
│   │   ├── random.js         # Random image logic
│   │   └── open.js           # Windows "Open With"
│   └── utils/
│       ├── scanner.js        # Filesystem scanner
│       └── thumbnails.js     # Sharp thumbnail generation
├── client/
│   ├── pages/
│   │   ├── home.html
│   │   ├── category.html
│   │   ├── image.html
│   │   ├── videos.html
│   │   └── video.html
│   ├── css/
│   │   ├── base.css
│   │   ├── theme-minimal.css
│   │   └── theme-modern.css
│   └── js/
│       ├── api.js            # Shared fetch wrapper
│       ├── home.js
│       ├── category.js
│       ├── image.js
│       ├── video.js
│       └── search.js
├── images/                   # Image library (subfolders = categories)
├── videos/                   # Video library (subfolders = categories)
├── thumbnails/               # Auto-generated thumbnails (do not commit)
├── data/
│   └── tags.json
├── package.json
└── .gitignore
```

---

## API Surface

| Method | Endpoint                          | Description                          |
|--------|-----------------------------------|--------------------------------------|
| GET    | `/api/categories`                 | List all image categories            |
| POST   | `/api/categories`                 | Create a new image category          |
| GET    | `/api/categories/:name`           | Images in a category (sort/filter)   |
| GET    | `/api/videos/categories`          | List all video categories            |
| GET    | `/api/videos/:name`               | Videos in a category                 |
| GET    | `/api/search?q=&type=`            | Search by name or tag                |
| GET    | `/api/random?category=&tag=`      | Get a random image                   |
| GET    | `/api/tags`                       | Get all tags                         |
| POST   | `/api/tags`                       | Update tags for an image             |
| POST   | `/api/open`                       | Open file with Windows "Open With"   |
| GET    | `/thumbnails/:category/:file`     | Serve generated thumbnail            |
| GET    | `/images/:category/:file`         | Serve full-resolution image          |
| GET    | `/videos/:category/:file`         | Serve video file                     |

---

## Implementation Plan

| Step | Description                                                                 |
|------|-----------------------------------------------------------------------------|
| 1    | Project setup — `package.json`, install Express + sharp, folder scaffold    |
| 2    | File scanner — reads `/images` and `/videos`, returns structured data       |
| 3    | Thumbnail generator — Sharp, cached to `/thumbnails`, skips if exists       |
| 4    | All API routes — categories, images, videos, tags, search, random, open-with|
| 5    | Base CSS + themes — variables, two dark themes, layout primitives           |
| 6    | Home page — category cards, search bar, random button                       |
| 7    | Category page — image grid, sort/filter/size controls, lazy load            |
| 8    | Image view page — zoom/pan, nav, slideshow, keyboard shortcuts, tags        |
| 9    | Video section — video categories + simple player page                       |
| 10   | Search page — cross-category results for name + tag queries                 |
| 11   | Polish — theme switcher, edge cases, error states                           |

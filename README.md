# img-view

A local image and video visualizer. Drop your files into folders, point a browser at `localhost:2080`, and browse them.

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
- Supported image formats: JPG, PNG, GIF, WebP, SVG, AVIF
- Supported video formats: MP4, WebM
- Loose files dropped directly into `images/` or `videos/` (not inside a subfolder) can be auto-organized from the home page banner.

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
| `Backspace` | Go back |

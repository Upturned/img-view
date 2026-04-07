const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const scanner = require('../utils/scanner');

// POST /api/open
// Opens a file using Windows' native "Open With" dialog via `rundll32`.
// Body: { category: string, filename: string, type: 'image' | 'video' }
router.post('/', (req, res) => {
  const { category, filename, type } = req.body;

  if (!category || !filename || !type) {
    return res.status(400).json({ error: 'category, filename, and type are required.' });
  }

  const baseDir = type === 'video' ? scanner.getVideosDir() : scanner.getImagesDir();
  const filePath = path.join(baseDir, category, filename);

  // Resolve and verify the file is inside the expected base directory (path traversal guard)
  const resolvedBase = path.resolve(baseDir);
  const resolvedFile = path.resolve(filePath);

  if (!resolvedFile.startsWith(resolvedBase + path.sep)) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  // Use rundll32 to trigger Windows' native "Open With" dialog
  const cmd = `rundll32.exe shell32.dll,OpenAs_RunDLL "${resolvedFile}"`;

  exec(cmd, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to open file.', detail: err.message });
    }
  });

  // Respond immediately — the dialog opens async
  res.json({ message: 'Open With dialog triggered.' });
});

module.exports = router;

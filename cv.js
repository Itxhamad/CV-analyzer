const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

const { config } = require('../config/env');
const { validateUpload, randomFilename } = require('../security/fileValidation');
const { heuristicScan } = require('../security/malwareScan');
const { extractText } = require('../parsers/documentParser');
const store = require('../storage/store');
const { heavyLimiter } = require('../security/rateLimiters');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileSize },
});

router.post('/upload', heavyLimiter, upload.single('cv'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file was uploaded. Please attach a CV file.' });
    }

    const { valid, errors, ext } = validateUpload(req.file, req.file.buffer, config.maxFileSize);
    if (!valid) {
      return res.status(422).json({ error: errors.join(' ') });
    }

    const filename = randomFilename(ext);
    const filePath = path.join(config.tmpDir, filename);
    await fs.writeFile(filePath, req.file.buffer);

    const scan = await heuristicScan(filePath, ext);
    if (!scan.clean) {
      await fs.unlink(filePath).catch(() => {});
      return res.status(422).json({
        error: 'This file was rejected by our security scan because it contains potentially unsafe embedded content.',
      });
    }

    let cvText;
    try {
      cvText = await extractText(filePath, ext);
    } catch (err) {
      await fs.unlink(filePath).catch(() => {});
      return next(err);
    }

    const sessionId = crypto.randomUUID();
    const { expiresAt } = store.createSession({
      id: sessionId,
      filePath,
      ext,
      cvText,
      meta: { originalName: req.file.originalname, size: req.file.size, uploadedAt: Date.now() },
    });

    res.status(201).json({
      sessionId,
      filename: req.file.originalname,
      size: req.file.size,
      type: ext,
      expiresAt,
      previewText: cvText.slice(0, 600),
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:sessionId', async (req, res, next) => {
  try {
    const deleted = await store.deleteSession(req.params.sessionId);
    if (!deleted) return res.status(404).json({ error: 'Session not found or already expired.' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

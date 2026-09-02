const crypto = require('crypto');
const path = require('path');

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png']);

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png',
]);

// Magic-byte signatures used to catch files whose extension/MIME claims to
// be one thing but whose actual bytes are something else (e.g. a renamed
// .exe). This is a heuristic check, not a full malware scan -- see
// security/malwareScan.js and the README for production hardening notes.
const SIGNATURES = [
  { ext: '.pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { ext: '.docx', bytes: [0x50, 0x4b, 0x03, 0x04] }, // PK.. (zip container)
  { ext: '.doc', bytes: [0xd0, 0xcf, 0x11, 0xe0] }, // legacy OLE compound file
  { ext: '.jpg', bytes: [0xff, 0xd8, 0xff] },
  { ext: '.jpeg', bytes: [0xff, 0xd8, 0xff] },
  { ext: '.png', bytes: [0x89, 0x50, 0x4e, 0x47] },
];

// Extensions/signatures that must NEVER be accepted regardless of what the
// client claims the file is -- catches double-extension tricks like
// "resume.pdf.exe" and disguised executables/scripts.
const DENYLIST_EXTENSIONS = ['.exe', '.sh', '.bat', '.cmd', '.js', '.jar', '.msi', '.dll', '.scr', '.php', '.py'];

function matchesSignature(buffer, ext) {
  if (ext === '.txt') return true; // plain text has no reliable magic bytes
  const sig = SIGNATURES.find((s) => s.ext === ext);
  if (!sig) return false;
  return sig.bytes.every((byte, i) => buffer[i] === byte);
}

function hasDeniedExtensionAnywhere(originalName) {
  const lower = originalName.toLowerCase();
  return DENYLIST_EXTENSIONS.some((bad) => lower.includes(bad));
}

/**
 * @param {object} file - multer file object ({ originalname, mimetype, size, buffer/path })
 * @param {Buffer} fileBuffer - first bytes of the file, for signature checking
 * @param {number} maxSize - max allowed size in bytes
 * @returns {{ valid: boolean, errors: string[], ext: string }}
 */
function validateUpload(file, fileBuffer, maxSize) {
  const errors = [];
  const ext = path.extname(file.originalname || '').toLowerCase();

  if (hasDeniedExtensionAnywhere(file.originalname || '')) {
    errors.push('This file type is not allowed.');
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    errors.push(`Unsupported file extension "${ext || '(none)'}". Allowed: PDF, DOC, DOCX, TXT, JPG, PNG.`);
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    errors.push(`Unsupported file MIME type "${file.mimetype}".`);
  }
  if (file.size > maxSize) {
    errors.push(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum is ${(maxSize / (1024 * 1024)).toFixed(0)}MB.`);
  }
  if (file.size === 0) {
    errors.push('The uploaded file is empty.');
  }
  if (errors.length === 0 && !matchesSignature(fileBuffer, ext)) {
    errors.push('The file contents do not match its extension. The file may be corrupted or disguised.');
  }

  return { valid: errors.length === 0, errors, ext };
}

/** Generates a random, collision-resistant filename that never reveals the original name. */
function randomFilename(ext) {
  return `${crypto.randomUUID()}${ext}`;
}

module.exports = { validateUpload, randomFilename, ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES };

const fs = require('fs/promises');
const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

class ParseError extends Error {}

function normalizeText(raw) {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

async function extractFromPdf(filePath) {
  // pdf-parse is required lazily so the rest of the app can run even if
  // this optional dependency isn't installed yet.
  const pdfParse = require('pdf-parse');
  const buffer = await fs.readFile(filePath);
  const result = await pdfParse(buffer);
  if (!result.text || !result.text.trim()) {
    throw new ParseError(
      'No selectable text was found in this PDF. It may be a scanned image-based CV -- ' +
      'this build does not yet support OCR. Try exporting the CV as a text-based PDF, or upload a DOCX/TXT version.'
    );
  }
  return result.text;
}

async function extractFromDocx(filePath) {
  const mammoth = require('mammoth');
  const { value, messages } = await mammoth.extractRawText({ path: filePath });
  const warnings = (messages || []).filter((m) => m.type === 'error');
  if (warnings.length) {
    console.warn('[documentParser] mammoth warnings:', warnings.map((w) => w.message));
  }
  if (!value || !value.trim()) {
    throw new ParseError('No text could be extracted from this DOCX file.');
  }
  return value;
}

async function extractFromTxt(filePath) {
  const buffer = await fs.readFile(filePath);
  const text = buffer.toString('utf8');
  if (!text.trim()) {
    throw new ParseError('The uploaded text file is empty.');
  }
  return text;
}

async function extractFromDoc() {
  // Legacy binary .doc (pre-2007 Word format) has no reliable dependency-free
  // parser. We deliberately fail loudly instead of silently returning
  // garbage/binary text into the AI prompt.
  throw new ParseError(
    'Legacy .doc files are not supported in this build. Please save the file as .docx or .pdf and re-upload.'
  );
}

/**
 * @param {string} filePath - path to the temporarily stored upload
 * @param {string} originalExt - lowercase extension including the dot, e.g. ".pdf"
 * @returns {Promise<string>} normalized plain text extracted from the document
 */
async function extractText(filePath, originalExt) {
  const ext = (originalExt || path.extname(filePath)).toLowerCase();

  if (IMAGE_EXTENSIONS.has(ext)) {
    throw new ParseError(
      'Image uploads (JPG/PNG) require OCR, which is not enabled in this build. ' +
      'Please upload a PDF, DOCX, or TXT version of your CV. See README.md for how to add OCR support.'
    );
  }

  let raw;
  if (ext === '.pdf') raw = await extractFromPdf(filePath);
  else if (ext === '.docx') raw = await extractFromDocx(filePath);
  else if (ext === '.doc') raw = await extractFromDoc(filePath);
  else if (ext === '.txt') raw = await extractFromTxt(filePath);
  else throw new ParseError(`Unsupported file type: ${ext}`);

  const normalized = normalizeText(raw);
  if (normalized.length < 40) {
    throw new ParseError('Very little readable text was found in this file. Please check the file and try again.');
  }
  return normalized;
}

module.exports = { extractText, ParseError };

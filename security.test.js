const { validateUpload, randomFilename } = require('../server/security/fileValidation');

const PDF_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const EXE_BYTES = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // "MZ" Windows executable header

describe('validateUpload', () => {
  test('accepts a genuine PDF', () => {
    const { valid, errors } = validateUpload(
      { originalname: 'resume.pdf', mimetype: 'application/pdf', size: PDF_BYTES.length },
      PDF_BYTES,
      10 * 1024 * 1024
    );
    expect(valid).toBe(true);
    expect(errors).toEqual([]);
  });

  test('rejects a file whose bytes do not match its claimed extension', () => {
    const { valid, errors } = validateUpload(
      { originalname: 'resume.pdf', mimetype: 'application/pdf', size: EXE_BYTES.length },
      EXE_BYTES,
      10 * 1024 * 1024
    );
    expect(valid).toBe(false);
    expect(errors.join(' ')).toMatch(/do not match/i);
  });

  test('rejects a double-extension executable disguised as a CV', () => {
    const { valid } = validateUpload(
      { originalname: 'resume.pdf.exe', mimetype: 'application/pdf', size: PDF_BYTES.length },
      PDF_BYTES,
      10 * 1024 * 1024
    );
    expect(valid).toBe(false);
  });

  test('rejects a file over the size limit', () => {
    const { valid, errors } = validateUpload(
      { originalname: 'resume.pdf', mimetype: 'application/pdf', size: 20 * 1024 * 1024 },
      PDF_BYTES,
      10 * 1024 * 1024
    );
    expect(valid).toBe(false);
    expect(errors.join(' ')).toMatch(/too large/i);
  });

  test('rejects an empty file', () => {
    const { valid, errors } = validateUpload(
      { originalname: 'resume.pdf', mimetype: 'application/pdf', size: 0 },
      Buffer.alloc(0),
      10 * 1024 * 1024
    );
    expect(valid).toBe(false);
    expect(errors.join(' ')).toMatch(/empty/i);
  });

  test('accepts plain text without requiring magic bytes', () => {
    const buf = Buffer.from('Just plain text content.');
    const { valid } = validateUpload(
      { originalname: 'resume.txt', mimetype: 'text/plain', size: buf.length },
      buf,
      10 * 1024 * 1024
    );
    expect(valid).toBe(true);
  });
});

describe('randomFilename', () => {
  test('never reveals or reuses the original filename', () => {
    const a = randomFilename('.pdf');
    const b = randomFilename('.pdf');
    expect(a).not.toBe(b);
    expect(a.endsWith('.pdf')).toBe(true);
    expect(a).not.toMatch(/resume/i);
  });
});

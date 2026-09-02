const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractText, ParseError } = require('../server/parsers/documentParser');

function writeTmp(name, content) {
  const filePath = path.join(os.tmpdir(), `cv-analyzer-test-${Date.now()}-${name}`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe('extractText', () => {
  test('extracts and normalizes plain text', async () => {
    const filePath = writeTmp('resume.txt', 'John Doe\r\nSoftware Engineer\r\n\r\n\r\n\r\nExperienced developer.');
    const text = await extractText(filePath, '.txt');
    expect(text).toContain('John Doe');
    expect(text).not.toContain('\r');
    fs.unlinkSync(filePath);
  });

  test('rejects an empty text file', async () => {
    const filePath = writeTmp('empty.txt', '   ');
    await expect(extractText(filePath, '.txt')).rejects.toBeInstanceOf(ParseError);
    fs.unlinkSync(filePath);
  });

  test('rejects image uploads with a clear OCR-not-supported message', async () => {
    await expect(extractText('/nonexistent.jpg', '.jpg')).rejects.toThrow(/OCR/i);
  });

  test('rejects legacy .doc files with a clear message', async () => {
    await expect(extractText('/nonexistent.doc', '.doc')).rejects.toThrow(/not supported/i);
  });

  test('rejects unsupported extensions', async () => {
    const filePath = writeTmp('resume.rtf', 'content');
    await expect(extractText(filePath, '.rtf')).rejects.toThrow(/Unsupported file type/i);
    fs.unlinkSync(filePath);
  });
});

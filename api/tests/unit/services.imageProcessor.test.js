// imageProcessor.removeBackground writes to disk and calls into the
// @imgly mock. We point UPLOAD_DIR at a temp dir per test and assert
// the URLs returned, plus the side-effects (files exist, are deleted).

const fs = require('fs/promises');
const os = require('os');
const path = require('path');

// Stub colorAnalyzer so analyzeImage's tests don't exercise sharp's native
// path with the 8-byte PNG fixtures the mock produces. The real analyser is
// covered by services.colorAnalyzer.test.js.
jest.mock('../../src/services/colorAnalyzer', () => ({
  detectColor: jest.fn(async () => ({ hex: '#abcdef', label: 'Sinine', confidence: 0.91 })),
}));

const ORIGINAL_UPLOAD_DIR = process.env.UPLOAD_DIR;

let tmp;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'imgproc-'));
  process.env.UPLOAD_DIR = tmp;
  // Module reads UPLOAD_DIR at require-time, so re-require with a fresh module cache.
  jest.resetModules();
});
afterEach(async () => {
  process.env.UPLOAD_DIR = ORIGINAL_UPLOAD_DIR;
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('removeBackground', () => {
  test('writes original + processed files and returns matching URLs', async () => {
    const { removeBackground } = require('../../src/services/imageProcessor');
    const out = await removeBackground(Buffer.from([1, 2, 3]), 'image/png', 'user-1', 'item-42');

    expect(out.imageUrl).toBe('/uploads/user-1/item-42.png');
    expect(out.originalUrl).toMatch(/^\/uploads\/user-1\/original_\d+_[a-f0-9-]+\.png$/);

    // The on-disk paths exist.
    await expect(fs.access(out.originalPath)).resolves.toBeUndefined();
    await expect(fs.access(out.processedPath)).resolves.toBeUndefined();
  });

  test('original file is always PNG regardless of input MIME', async () => {
    const { removeBackground } = require('../../src/services/imageProcessor');
    const jpg  = await removeBackground(Buffer.from('x'), 'image/jpeg', 'u', 'a');
    const webp = await removeBackground(Buffer.from('x'), 'image/webp', 'u', 'b');
    const png  = await removeBackground(Buffer.from('x'), 'image/png',  'u', 'c');

    expect(jpg.originalUrl).toMatch(/\.png$/);
    expect(webp.originalUrl).toMatch(/\.png$/);
    expect(png.originalUrl).toMatch(/\.png$/);
    expect(jpg.originalPath).toMatch(/\.png$/);
    expect(webp.originalPath).toMatch(/\.png$/);
    expect(png.originalPath).toMatch(/\.png$/);
  });

  test('JPEG input gets re-encoded to PNG bytes on disk', async () => {
    const { removeBackground } = require('../../src/services/imageProcessor');
    const out = await removeBackground(Buffer.from('x'), 'image/jpeg', 'u', 'jpegitem');

    // Real sharp would emit a valid PNG; the sharp mock returns the 8-byte
    // PNG magic prefix. Either way the first byte is 0x89.
    const written = await fs.readFile(out.originalPath);
    expect(written[0]).toBe(0x89);
    expect(written.slice(1, 4).toString('ascii')).toBe('PNG');
  });

  test('PNG input passes through untouched (no re-encode)', async () => {
    const { removeBackground } = require('../../src/services/imageProcessor');
    const original = Buffer.from('verbatim-png-bytes');
    const out = await removeBackground(original, 'image/png', 'u', 'pngitem');

    const written = await fs.readFile(out.originalPath);
    expect(written.equals(original)).toBe(true);
  });

  test('creates per-user subdirectory', async () => {
    const { removeBackground } = require('../../src/services/imageProcessor');
    await removeBackground(Buffer.from('x'), 'image/png', 'tenant-9', 'item-1');
    const entries = await fs.readdir(tmp);
    expect(entries).toContain('tenant-9');
  });
});

describe('deleteFileSafe', () => {
  test('removes an existing /uploads file', async () => {
    const { removeBackground, deleteFileSafe } = require('../../src/services/imageProcessor');
    const out = await removeBackground(Buffer.from('x'), 'image/png', 'u', 'i');
    await deleteFileSafe(out.imageUrl);
    await expect(fs.access(out.processedPath)).rejects.toThrow();
  });

  test('is a noop when given null/undefined/empty', async () => {
    const { deleteFileSafe } = require('../../src/services/imageProcessor');
    await expect(deleteFileSafe(null)).resolves.toBeUndefined();
    await expect(deleteFileSafe(undefined)).resolves.toBeUndefined();
    await expect(deleteFileSafe('')).resolves.toBeUndefined();
  });

  test('swallows ENOENT silently (file already gone)', async () => {
    const { deleteFileSafe } = require('../../src/services/imageProcessor');
    await expect(deleteFileSafe('/uploads/never/created.png')).resolves.toBeUndefined();
  });

  test('logs a warning on non-ENOENT errors', async () => {
    const { deleteFileSafe } = require('../../src/services/imageProcessor');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fsMod = require('fs/promises');
    const spy = jest.spyOn(fsMod, 'unlink').mockRejectedValueOnce(Object.assign(new Error('EPERM'), { code: 'EPERM' }));
    await deleteFileSafe('/uploads/u/x.png');
    expect(warn).toHaveBeenCalled();
    spy.mockRestore();
    warn.mockRestore();
  });
});

describe('analyzeImage', () => {
  test('returns { color } from colorAnalyzer.detectColor', async () => {
    const { analyzeImage } = require('../../src/services/imageProcessor');
    const result = await analyzeImage(Buffer.from('processed-png-bytes'));
    expect(result).toEqual({
      color: { hex: '#abcdef', label: 'Sinine', confidence: 0.91 },
    });
  });

  test('forwards the buffer it was given to the analyser', async () => {
    const { analyzeImage } = require('../../src/services/imageProcessor');
    const { detectColor } = require('../../src/services/colorAnalyzer');
    const buf = Buffer.from('processed-png-bytes');
    await analyzeImage(buf);
    expect(detectColor).toHaveBeenCalledWith(buf);
  });
});

describe('removeBackground — Phase 1 plumbing', () => {
  test('returns processedBuffer for downstream analysis', async () => {
    const { removeBackground } = require('../../src/services/imageProcessor');
    const out = await removeBackground(Buffer.from('x'), 'image/png', 'u', 'i');
    expect(Buffer.isBuffer(out.processedBuffer)).toBe(true);
    expect(out.processedBuffer.length).toBeGreaterThan(0);
  });
});

describe('commitStagedImage', () => {
  // Pre-seed a fake staged file the tests can rename.
  async function seedStaged(userId, filename) {
    const userDir = path.join(tmp, String(userId));
    await fs.mkdir(userDir, { recursive: true });
    const abs = path.join(userDir, filename);
    await fs.writeFile(abs, 'x');
    return { abs, url: `/uploads/${userId}/${filename}` };
  }

  test('renames file when newBasename is given and returns the new URL', async () => {
    const { commitStagedImage } = require('../../src/services/imageProcessor');
    const { abs, url } = await seedStaged('u1', 'preview_1.png');
    const newUrl = await commitStagedImage({
      stagedUrl: url, userId: 'u1', newBasename: '0000042.png',
    });
    expect(newUrl).toBe('/uploads/u1/0000042.png');
    await expect(fs.access(abs)).rejects.toThrow(); // old gone
    await expect(fs.access(path.join(tmp, 'u1', '0000042.png'))).resolves.toBeUndefined();
  });

  test('returns the URL untouched when no rename is requested', async () => {
    const { commitStagedImage } = require('../../src/services/imageProcessor');
    const { abs, url } = await seedStaged('u1', 'original_1_abc.png');
    const returned = await commitStagedImage({ stagedUrl: url, userId: 'u1' });
    expect(returned).toBe(url);
    await expect(fs.access(abs)).resolves.toBeUndefined();
  });

  test('returns null when stagedUrl is empty', async () => {
    const { commitStagedImage } = require('../../src/services/imageProcessor');
    expect(await commitStagedImage({ stagedUrl: null, userId: 'u1' })).toBeNull();
  });

  test('rejects URL outside caller namespace', async () => {
    const { commitStagedImage } = require('../../src/services/imageProcessor');
    await seedStaged('victim', 'preview_x.png');
    await expect(commitStagedImage({
      stagedUrl: '/uploads/victim/preview_x.png',
      userId: 'attacker',
      newBasename: '0000001.png',
    })).rejects.toMatchObject({ status: 400, message: /caller namespace/i });
  });

  test('rejects path-traversal attempts', async () => {
    const { commitStagedImage } = require('../../src/services/imageProcessor');
    await expect(commitStagedImage({
      stagedUrl: '/uploads/u1/../escape.png',
      userId: 'u1',
      newBasename: 'x.png',
    })).rejects.toMatchObject({ status: 400 });
  });

  test('rejects when staged file does not exist on disk', async () => {
    const { commitStagedImage } = require('../../src/services/imageProcessor');
    await expect(commitStagedImage({
      stagedUrl: '/uploads/u1/missing.png',
      userId: 'u1',
      newBasename: 'x.png',
    })).rejects.toMatchObject({ status: 400, message: /not found/i });
  });
});

// colorAnalyzer.analyzePixels is the pure-JS core — exercised here with
// hand-built RGBA buffers so the suite stays free of sharp's native binaries.
// (The full sharp-driven `detectColor` is implicitly covered by the routes
// integration suite, which uses real images.)

const { analyzePixels, PALETTE, rgbToHex } = require('../../src/services/colorAnalyzer');

// Build a width×height RGBA buffer where every pixel is the given (r,g,b,a).
function solidRGBA(width, height, r, g, b, a) {
  const buf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    buf[i * 4]     = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}

// Half left-half right with two different colours, full alpha.
function splitRGBA(width, height, left, right) {
  const buf = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const c = x < width / 2 ? left : right;
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
    }
  }
  return buf;
}

describe('analyzePixels — solid colours map to expected palette labels', () => {
  const cases = [
    { name: 'pure black',  rgb: [0, 0, 0],       expect: 'Must' },
    { name: 'pure white',  rgb: [255, 255, 255], expect: 'Valge' },
    { name: 'mid grey',    rgb: [128, 128, 128], expect: 'Hall' },
    { name: 'bright red',  rgb: [220, 30, 30],   expect: 'Punane' },
    { name: 'bright blue', rgb: [40, 70, 200],   expect: 'Sinine' },
    { name: 'forest green',rgb: [30, 130, 60],   expect: 'Roheline' },
    { name: 'yellow',      rgb: [240, 200, 20],  expect: 'Kollane' },
    { name: 'pink',        rgb: [240, 160, 190], expect: 'Roosa' },
    { name: 'brown',       rgb: [120, 70, 30],   expect: 'Pruun' },
    { name: 'beige',       rgb: [220, 200, 170], expect: 'Beež' },
    { name: 'purple',      rgb: [140, 70, 180],  expect: 'Lilla' },
    { name: 'orange',      rgb: [230, 120, 30],  expect: 'Oranž' },
  ];

  cases.forEach(({ name, rgb, expect: label }) => {
    test(`${name} → ${label}`, () => {
      const data = solidRGBA(16, 16, rgb[0], rgb[1], rgb[2], 255);
      // step=1 so the 16×16 fixture covers every pixel — production uses step=4.
      const out = analyzePixels(data, { width: 16, height: 16, channels: 4 }, 1);
      expect(out).not.toBeNull();
      expect(out.label).toBe(label);
      expect(out.confidence).toBeGreaterThan(0.9);
      expect(out.hex).toMatch(/^#[0-9a-f]{6}$/);
    });
  });
});

describe('analyzePixels — alpha and edge cases', () => {
  test('transparent pixels are ignored', () => {
    // Half red (opaque), half white (alpha=0). Alpha=0 pixels are bg, must drop.
    const buf = Buffer.alloc(16 * 16 * 4);
    for (let i = 0; i < 16 * 16; i++) {
      if (i < (16 * 16) / 2) {
        buf[i * 4] = 220; buf[i * 4 + 1] = 30; buf[i * 4 + 2] = 30; buf[i * 4 + 3] = 255;
      } else {
        buf[i * 4] = 255; buf[i * 4 + 1] = 255; buf[i * 4 + 2] = 255; buf[i * 4 + 3] = 0;
      }
    }
    const out = analyzePixels(buf, { width: 16, height: 16, channels: 4 }, 1);
    expect(out.label).toBe('Punane');
    // Confidence is computed over non-transparent pixels only — the red half is 100%.
    expect(out.confidence).toBeCloseTo(1, 1);
  });

  test('fully transparent input returns null', () => {
    const buf = solidRGBA(8, 8, 100, 100, 100, 0);
    const out = analyzePixels(buf, { width: 8, height: 8, channels: 4 }, 1);
    expect(out).toBeNull();
  });

  test('RGB (3-channel) buffer is accepted — no alpha gating', () => {
    const buf = Buffer.alloc(8 * 8 * 3);
    for (let i = 0; i < 8 * 8; i++) {
      buf[i * 3] = 220; buf[i * 3 + 1] = 30; buf[i * 3 + 2] = 30;
    }
    const out = analyzePixels(buf, { width: 8, height: 8, channels: 3 }, 1);
    expect(out.label).toBe('Punane');
  });

  test('two-colour image picks the dominant by area', () => {
    // 12 columns red, 4 columns blue → red should win at ~0.75 confidence.
    const buf = Buffer.alloc(16 * 16 * 4);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 4;
        if (x < 12) { buf[i] = 220; buf[i + 1] = 30; buf[i + 2] = 30; }
        else        { buf[i] = 40;  buf[i + 1] = 70; buf[i + 2] = 200; }
        buf[i + 3] = 255;
      }
    }
    const out = analyzePixels(buf, { width: 16, height: 16, channels: 4 }, 1);
    expect(out.label).toBe('Punane');
    expect(out.confidence).toBeGreaterThan(0.6);
    expect(out.confidence).toBeLessThan(0.9);
  });

  test('confidence is bounded [0, 1] and hex is well-formed', () => {
    const data = splitRGBA(32, 32, [10, 200, 200], [200, 200, 10]);
    const out = analyzePixels(data, { width: 32, height: 32, channels: 4 }, 1);
    expect(out.confidence).toBeGreaterThanOrEqual(0);
    expect(out.confidence).toBeLessThanOrEqual(1);
    expect(out.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(PALETTE.map((p) => p.label)).toContain(out.label);
  });

  test('step=4 still produces a result on a uniform 16×16 image', () => {
    const data = solidRGBA(16, 16, 30, 130, 60, 255);
    const out = analyzePixels(data, { width: 16, height: 16, channels: 4 }, 4);
    expect(out).not.toBeNull();
    expect(out.label).toBe('Roheline');
  });
});

describe('rgbToHex formatting', () => {
  test('zero-pads single-digit channels', () => {
    expect(rgbToHex(1, 2, 3)).toBe('#010203');
  });
  test('clamps out-of-range channels', () => {
    expect(rgbToHex(-5, 999, 128)).toBe('#00ff80');
  });
  test('rounds non-integer channel values', () => {
    expect(rgbToHex(127.4, 127.5, 127.6)).toBe('#7f8080');
  });
});

describe('PALETTE shape', () => {
  test('each entry has label + hex; hex is well-formed', () => {
    PALETTE.forEach((p) => {
      expect(typeof p.label).toBe('string');
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });
});

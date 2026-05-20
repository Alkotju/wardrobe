// Replacement for `sharp` in tests. The unit suite calls imageProcessor with
// tiny synthetic buffers (e.g. Buffer.from('x')) which real sharp would
// reject as "Input buffer contains unsupported image format". This mock
// short-circuits the .png().toBuffer() chain to a minimal valid PNG header,
// keeping the conversion code path exercised without needing real image
// fixtures.
function sharp(_input) {
  return {
    // .rotate() with no args auto-applies EXIF orientation in real sharp.
    // The mock just keeps the chain alive — orientation isn't exercised here.
    rotate() { return this; },
    // resize() short-circuits to no-op — toPngBuffer queries metadata first
    // and only resizes oversized images. Synthetic fixtures here are tiny so
    // they never trigger resize even with real sharp.
    resize() { return this; },
    png() { return this; },
    raw() { return this; },
    // toPngBuffer checks dimensions to decide whether to resize. The mock
    // reports a tiny image so the resize branch is always skipped and the
    // existing tests keep their original expectations.
    async metadata() {
      return { width: 4, height: 4, channels: 4, format: 'png', hasAlpha: true };
    },
    async toBuffer(opts) {
      // PNG magic + IHDR-ish bytes — enough for tests asserting the first
      // byte is 0x89.
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      if (opts && opts.resolveWithObject) {
        return { data: png, info: { width: 4, height: 4, channels: 4 } };
      }
      return png;
    },
  };
}

module.exports = sharp;

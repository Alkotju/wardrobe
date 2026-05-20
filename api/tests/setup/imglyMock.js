// Replacement for @imgly/background-removal-node — the real package downloads
// a ~30MB ONNX model. The mock returns a tiny "PNG" Blob synchronously so
// imageProcessor.removeBackground() flows the same code paths without I/O.
async function removeBackground(_buffer /* , options */) {
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return {
    arrayBuffer: async () => pngBytes.buffer.slice(
      pngBytes.byteOffset,
      pngBytes.byteOffset + pngBytes.byteLength
    ),
  };
}

module.exports = { removeBackground };

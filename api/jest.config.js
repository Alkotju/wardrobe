/** Jest configuration for the wardrobe API.
 *
 *  - Node env (no DOM).
 *  - Each integration test starts/stops its own in-memory Mongo to keep tests
 *    fully isolated and parallel-safe (we still run with --runInBand because
 *    mongodb-memory-server downloads are global on first run).
 *  - setupFiles runs BEFORE the test framework boots, which is where we set
 *    env vars (JWT_SECRET etc.) so that any top-level requires in production
 *    code see them.
 */
module.exports = {
  testEnvironment: 'node',
  rootDir: __dirname,
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup/env.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/config/db.js',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov'],
  testTimeout: 30000,
  clearMocks: true,
  restoreMocks: true,
  // Background-removal model loads a large ONNX file we always mock.
  // Mocking it at the module-name level keeps every test fast.
  moduleNameMapper: {
    '^@imgly/background-removal-node$': '<rootDir>/tests/setup/imglyMock.js',
    // Real sharp can't decode the synthetic Buffer.from('x') inputs the unit
    // suite uses for imageProcessor — mock it to a constant PNG.
    '^sharp$': '<rootDir>/tests/setup/sharpMock.js',
  },
};

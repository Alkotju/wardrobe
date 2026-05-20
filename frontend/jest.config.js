module.exports = {
  testEnvironment: 'jsdom',
  rootDir: __dirname,
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  setupFilesAfterEach: [],
  collectCoverageFrom: ['js/**/*.js'],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov'],
  clearMocks: true,
  restoreMocks: true,
};

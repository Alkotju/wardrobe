// Loaded by Jest BEFORE the test framework. Server code reads JWT_SECRET at
// require-time inside server.js — but in tests we never import server.js, only
// appFactory.js which builds the app without the env-var hard-exit. We still
// need JWT_SECRET for auth middleware and bcrypt rounds set low for speed.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-prod';
process.env.JWT_EXPIRY = '1h';
process.env.BCRYPT_ROUNDS = '4';     // fast hashes for tests
process.env.MAX_USERS = '20';
process.env.UPLOAD_DIR = require('os').tmpdir();
process.env.YR_USER_AGENT = 'WardrobeTest/1.0 test@example.com';

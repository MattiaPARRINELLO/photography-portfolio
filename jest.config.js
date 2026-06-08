module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  collectCoverageFrom: [
    'server/**/*.js',
    'scripts/**/*.js',
    'server.js',
    '!node_modules/**',
    '!tests/**',
    '!jest.config.js',
    '!coverage/**',
    '!dist/**'
  ],
  testMatch: ['**/tests/**/*.test.js'],
  clearMocks: true,
  restoreMocks: true,
  forceExit: true
};

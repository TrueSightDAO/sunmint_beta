const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  // Node unit scripts (tests/*.test.js) are run directly via `node`; Playwright
  // must only collect browser specs, else its loader crashes trying to require
  // them (they reference `global`, undefined under the ESM loader).
  testMatch: /\.spec\.(ts|js)$/,
  timeout: 30000,
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:8099',
  },
  webServer: {
    command: 'python3 -m http.server 8099',
    url: 'http://127.0.0.1:8099',
    reuseExistingServer: true,
    timeout: 30000,
  },
});

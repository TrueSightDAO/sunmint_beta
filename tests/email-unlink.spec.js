const { test, expect } = require('@playwright/test');
const { stubGovernor, stubSubmit } = require('./helpers');

const PAGES = [
  { name: 'plant-tree', path: '/' },
  { name: 'monitor-tree-growth', path: '/monitor-tree-growth/' },
];

for (const { name, path } of PAGES) {
  test(`Enter in email input triggers Link Email (${name})`, async ({ page }) => {
    await stubGovernor(page);
    await stubSubmit(page);
    const requestPromise = page.waitForRequest('**/dao/submit_contribution');
    await page.goto(path);
    await page.fill('#emailInput', 'farmer@example.com');
    await page.press('#emailInput', 'Enter');
    await requestPromise;
  });

  test(`unlink deletes publicKey and privateKey (${name})`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('publicKey', 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA'.repeat(3));
      localStorage.setItem(
        'privateKey',
        'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ'.repeat(3)
      );
      localStorage.setItem('sunmint_linked_email', 'farmer@example.com');
    });
    await page.goto(path);
    await page.waitForSelector('#emailUnlinkBtn');

    page.on('dialog', (d) => d.accept());
    await page.click('#emailUnlinkBtn');

    await page.waitForFunction(
      () =>
        localStorage.getItem('publicKey') === null &&
        localStorage.getItem('privateKey') === null
    );
    expect(await page.evaluate(() => localStorage.getItem('publicKey'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('privateKey'))).toBeNull();
  });
}

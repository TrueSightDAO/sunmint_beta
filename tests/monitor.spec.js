const { test, expect } = require('@playwright/test');
const { stubGovernor, stubTreeIndex, stubSubmit } = require('./helpers');

async function openMonitor(page, { tree = 'TREE_A' } = {}) {
  await stubGovernor(page);
  await stubTreeIndex(page);
  await page.goto(`/monitor-tree-growth/?tree=${tree}`);
  await page.waitForSelector('#treeSelect option[value="TREE_A"]', { state: 'attached' });
}

test('MARK INVALID button is a sibling of treeDetailNoPhoto (not nested)', async ({ page }) => {
  await openMonitor(page);
  const nested = await page.evaluate(
    () => !!document.querySelector('#treeDetailNoPhoto #invalidZone')
  );
  expect(nested).toBe(false);
  const parentClass = await page.evaluate(
    () => document.querySelector('#invalidZone').parentElement.className
  );
  expect(parentClass).toContain('tree-detail-meta');
});

test('MARK INVALID button has cursor:pointer and data-i18n', async ({ page }) => {
  await openMonitor(page);
  expect(await page.getAttribute('#markInvalidBtn', 'style')).toContain('cursor:pointer');
  expect(await page.getAttribute('#markInvalidBtn', 'data-i18n')).toBe('markInvalid');
});

test('markTreeInvalid submits REJECT, greys out immediately, removes tree', async ({ page }) => {
  await stubGovernor(page);
  await stubTreeIndex(page);
  await stubSubmit(page);
  await page.goto('/monitor-tree-growth/?tree=TREE_A');
  await page.waitForSelector('#markInvalidBtn');

  page.on('dialog', (d) => d.accept());
  const submitRequest = page.waitForRequest('**/dao/submit_contribution');
  await page.click('#markInvalidBtn');

  // Grey-out happens the instant confirm is accepted (before the network).
  await page.waitForFunction(
    () => document.getElementById('markInvalidBtn').disabled === true
  );
  expect(await page.isDisabled('#markInvalidBtn')).toBe(true);

  // The rejected tree is dropped from the dropdown.
  await page.waitForFunction(() => {
    const opts = Array.from(document.querySelectorAll('#treeSelect option')).map(
      (o) => o.value
    );
    return !opts.includes('TREE_A');
  });
  const options = await page.$$eval('#treeSelect option', (o) => o.map((x) => x.value));
  expect(options).not.toContain('TREE_A');
  expect(options).toContain('TREE_B');

  // REJECT event reached Edgar (submit_contribution).
  await submitRequest;
});

test('tree index is cached to localStorage after a successful internet load', async ({ page }) => {
  await stubGovernor(page);
  await stubTreeIndex(page);
  await page.goto('/monitor-tree-growth/');
  await page.waitForSelector('#treeSelect option[value="TREE_A"]', { state: 'attached' });
  const cached = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('sunmint_tree_index_cache') || '[]')
  );
  expect(cached.map((t) => t.id)).toEqual(['TREE_A', 'TREE_B']);
});

test('tree index falls back to the cached list when offline', async ({ page }) => {
  await stubGovernor(page);
  await stubTreeIndex(page, { fail: true });
  await page.addInitScript(() => {
    localStorage.setItem(
      'sunmint_tree_index_cache',
      JSON.stringify([
        {
          id: 'CACHED_A',
          species: 'Cacao',
          lat: null,
          lng: null,
          lastMeasured: null,
          photo: null,
          status: 'NEW',
          qrCode: null,
        },
      ])
    );
  });
  await page.goto('/monitor-tree-growth/');
  await page.waitForSelector('#treeSelect option[value="CACHED_A"]', { state: 'attached' });
  const options = await page.$$eval('#treeSelect option', (o) => o.map((x) => x.value));
  expect(options).toContain('CACHED_A');
});

test('camera viewport has no max-height clamp (stays proportionate)', async ({ page }) => {
  await stubGovernor(page);
  await stubTreeIndex(page);
  await page.goto('/monitor-tree-growth/');
  const styles = await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'camera-viewport';
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    el.remove();
    return { maxHeight: cs.maxHeight, aspectRatio: cs.aspectRatio };
  });
  expect(styles.maxHeight === '' || styles.maxHeight === 'none').toBe(true);
});

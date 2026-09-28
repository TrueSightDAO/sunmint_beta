// Behavioral tests for /my-trees/ (the "My Trees" module).
//
// A tree is "mine" iff its properties.pk_hash equals the pk_hash derived from
// the public key this device holds in localStorage['publicKey']. The page must:
//   - list ONLY my trees, each with its status
//   - expand the details card when the tree id is clicked  (R3)
//   - link through to the Monitor Tree module with ?tree=<id> (R4)
//   - show honest empty/no-key states
//   - never echo the raw public key
const { test, expect } = require('@playwright/test');
const crypto = require('crypto');

// Same derivation the page (and build_tree_geojson.py) uses:
//   pk_hash = 'pk-' + base64url(sha256(spki(publicKey)))[:12]
// Computed here independently so the spec doesn't depend on loading the
// browser-side IIFE under Playwright's module loader.
function derivePkHashSync(spkiBase64) {
  const der = Buffer.from(spkiBase64, 'base64');
  const b64url = crypto.createHash('sha256').update(der).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return 'pk-' + b64url.slice(0, 12);
}

// A stand-in base64 SPKI public key; we derive the expected pk_hash from it with
// the SAME function the page uses, so the writer/reader contract is exercised.
const PUB = Buffer.from('stand-in spki bytes for my-trees spec').toString('base64');

async function feedFor(pkHash) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-39.0, -13.0] },
        properties: {
          tree_id: 'MINE_1', species: 'Cacao - Criolla',
          photo_url: 'https://example.com/m1.jpg', status: 'LINKED',
          qr_code: 'QR_MINE_1', last_measured: '2026-09-01T00:00:00Z',
          program: 'crf-anapu', submission_source: 'https://sunmint.truesight.me/',
          pk_hash: pkHash,
        },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-39.1, -13.1] },
        properties: {
          tree_id: 'MINE_2', species: 'Cacao - Trinitario',
          photo_url: 'https://example.com/m2.jpg', status: 'NEW',
          qr_code: null, last_measured: null, program: 'crf-anapu',
          pk_hash: pkHash,
        },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-38.0, -12.0] },
        properties: {
          tree_id: 'THEIRS_1', species: 'Cacao - Forestero',
          photo_url: 'https://example.com/t1.jpg', status: 'SOLD',
          pk_hash: 'pk-SOMEONEELSE1',
        },
      },
    ],
  };
}

async function stubFeed(page, feed) {
  await page.route('**/trees/index.geojson*', (r) => r.fulfill({ json: feed }));
}

async function openWithKey(page, { pub = PUB } = {}) {
  const pkHash = pub ? derivePkHashSync(pub) : '';
  await stubFeed(page, await feedFor(pkHash));
  await page.addInitScript(([p]) => {
    if (p) localStorage.setItem('publicKey', p); else localStorage.removeItem('publicKey');
  }, [pub]);
  await page.goto('/my-trees/');
  return pkHash;
}

test('lists ONLY my trees, each with its status chip', async ({ page }) => {
  await openWithKey(page);
  await page.waitForSelector('.tree-card');
  const ids = await page.$$eval('.tree-card .tc-toggle', (b) => b.map((x) => x.textContent));
  expect(ids).toEqual(['MINE_1', 'MINE_2']);           // THEIRS_1 excluded
  const chips = await page.$$eval('.tree-card .chip', (c) => c.map((x) => x.textContent));
  expect(chips).toContain('LINKED');
  expect(chips).toContain('NEW');
  expect(chips).not.toContain('SOLD');                 // belongs to someone else
  await expect(page.locator('#count')).toContainText('2');
});

test('clicking the tree id expands the details card (R3)', async ({ page }) => {
  await openWithKey(page);
  await page.waitForSelector('.tree-card .tc-toggle');
  const details = page.locator('.tree-card .tc-details').first();
  await expect(details).toBeHidden();
  await page.locator('.tree-card .tc-toggle').first().click();
  await expect(details).toBeVisible();
  await expect(details).toContainText('LINKED');
  await expect(page.locator('.tree-card .tc-toggle').first()).toHaveAttribute('aria-expanded', 'true');
  // collapse again
  await page.locator('.tree-card .tc-toggle').first().click();
  await expect(details).toBeHidden();
});

test('details card links through to Monitor Tree with ?tree=<id> (R4)', async ({ page }) => {
  await openWithKey(page);
  // The link lives inside the (collapsed) details card -- reach it the way a
  // user does: expand the tree id first, then the "Monitor this tree" link.
  await page.waitForSelector('.tree-card .tc-toggle');
  const link = page.locator('.tc-monitor').first();
  await expect(link).toBeHidden();
  await page.locator('.tree-card .tc-toggle').first().click();
  await expect(link).toBeVisible();
  expect(await link.getAttribute('href')).toBe(
    '/monitor-tree-growth/?tree=' + encodeURIComponent('MINE_1')
  );
});

test('a device with no key shows the honest no-identity state', async ({ page }) => {
  await openWithKey(page, { pub: '' });
  await expect(page.locator('#status')).toContainText(/No planting identity|Nenhuma identidade/);
  expect(await page.locator('.tree-card').count()).toBe(0);
});

test('a key that owns zero trees shows the honest empty state (not blank)', async ({ page }) => {
  await stubFeed(page, await feedFor('pk-NOBODYOWNSIT'));   // nobody matches our hash
  await page.addInitScript(([p]) => localStorage.setItem('publicKey', p), [PUB]);
  await page.goto('/my-trees/');
  await expect(page.locator('#status')).toContainText(/No trees found|Nenhuma árvore/);
  expect(await page.locator('.tree-card').count()).toBe(0);
});

test('privacy: the raw public key never reaches the DOM', async ({ page }) => {
  await openWithKey(page);
  await page.waitForSelector('.tree-card');
  const html = await page.content();
  expect(html).not.toContain(PUB);
});

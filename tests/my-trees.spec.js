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
          request_txid: 'Edgar_20260901000000_001_SIGAAA',
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
          request_txid: 'Edgar_20260902000000_002_SIGBBB',
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
    localStorage.setItem('sunmint_lang', 'en');
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
  expect(chips).toContain('Linked');
  expect(chips).toContain('New');
  expect(chips).not.toContain('Sold');                 // belongs to someone else
  await expect(page.locator('#count')).toContainText('2');
});

test('clicking the tree id expands the details card (R3)', async ({ page }) => {
  await openWithKey(page);
  await page.waitForSelector('.tree-card .tc-toggle');
  const details = page.locator('.tree-card .tc-details').first();
  await expect(details).toBeHidden();
  await page.locator('.tree-card .tc-toggle').first().click();
  await expect(details).toBeVisible();
  await expect(details).toContainText('Linked');
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

test('clicking a card highlights it, expands details, and sets ?tree= in the URL (R1/R2)', async ({ page }) => {
  await openWithKey(page);
  await page.waitForSelector('.tree-card');
  const card = page.locator('.tree-card').first();
  await expect(card).not.toHaveClass(/is-selected/);
  await card.locator('.tc-meta').click();
  await expect(card).toHaveClass(/is-selected/);
  await expect(card.locator('.tc-details')).toBeVisible();
  expect(page.url()).toContain('?tree=' + encodeURIComponent('MINE_1'));
});

test('a ?tree=<id> deep-link scrolls to and expands that tree on load (R2)', async ({ page }) => {
  const pkHash = derivePkHashSync(PUB);
  await stubFeed(page, await feedFor(pkHash));
  await page.addInitScript(([p]) => {
    localStorage.setItem('publicKey', p);
    localStorage.setItem('sunmint_lang', 'en');
  }, [PUB]);
  await page.goto('/my-trees/?tree=' + encodeURIComponent('MINE_2'));
  await page.waitForSelector('.tree-card');
  const card = page.locator('.tree-card[data-tree="MINE_2"]');
  await expect(card).toHaveClass(/is-selected/);
  await expect(card.locator('.tc-details')).toBeVisible();
});

test('the expanded card shows the lifecycle checklist (R1)', async ({ page }) => {
  await openWithKey(page);
  await page.waitForSelector('.tree-card');
  await page.locator('.tree-card .tc-toggle').first().click();
  const ms = page.locator('.tree-card').first().locator('.tc-milestones li');
  await expect(ms).toHaveCount(5);
  await expect(page.locator('.tree-card').first().locator('.tc-milestones')).toContainText('Planted');
  await expect(page.locator('.tree-card').first().locator('.tc-milestones')).toContainText('QR linked');
});

test('selecting another card moves the highlight (only one selected)', async ({ page }) => {
  await openWithKey(page);
  await page.waitForSelector('.tree-card');
  await page.locator('.tree-card').nth(0).locator('.tc-meta').click();
  await page.locator('.tree-card').nth(1).locator('.tc-meta').click();
  await expect(page.locator('.tree-card.is-selected')).toHaveCount(1);
  await expect(page.locator('.tree-card').nth(1)).toHaveClass(/is-selected/);
});

test('ledger link (PR4b) and the lifecycle checklist (R1) coexist on one card', async ({ page }) => {
  await openWithKey(page);
  await page.waitForSelector('.tree-card');
  await page.locator('.tree-card .tc-toggle').first().click();
  const card = page.locator('.tree-card').first();
  await expect(card.locator('.tc-milestones li')).toHaveCount(5);          // my feature
  await expect(card.locator('a[href*="/ledger/explorer/?q="]')).toHaveCount(1); // their feature
});

test('the txid renders as Copy ID / Copy link affordances (Gary)', async ({ page }) => {
  await openWithKey(page);
  await page.waitForSelector('.tree-card');
  await page.locator('.tree-card .tc-toggle').first().click();
  const card = page.locator('.tree-card').first();
  // copy affordances live in BOTH the always-visible row and the expanded
  // details (2 + 2): the id is copyable before and after expanding.
  await expect(card.locator('.tc-meta a.tc-copy')).toHaveCount(2);
  await expect(card.locator('.tc-details a.tc-copy')).toHaveCount(2);
  await expect(card.locator('a.tc-copy').first()).toContainText('Copy ID');
  await expect(card.locator('a.tc-copy').nth(1)).toContainText('Copy link');
});

test('a ?tx=<id> deep link filters to, scrolls to and expands the matching tree (Gary)', async ({ page }) => {
  await openWithKey(page);
  await page.waitForSelector('.tree-card');
  await page.goto('/my-trees/?tx=' + encodeURIComponent('Edgar_20260901000000_001'));
  const card = page.locator('.tree-card[data-tree="MINE_1"]');
  await expect(card).toHaveClass(/is-selected/);
  await expect(card.locator('.tc-details')).toBeVisible();
  await expect(page.locator('#txidFilter')).toHaveValue('Edgar_20260901000000_001');
});

test('a shared txid deep link expands EVERY match and shows the count note', async ({ page }) => {
  const pkHash = derivePkHashSync(PUB);
  const shared = 'Edgar_20260925000000_SHARED_SIG';
  const feed = { type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { tree_id: 'S1', status: 'NEW', pk_hash: pkHash, request_txid: shared, photo_url: 'https://e.com/s.jpg' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { tree_id: 'S2', status: 'NEW', pk_hash: pkHash, request_txid: shared, photo_url: 'https://e.com/s.jpg' } },
  ] };
  await stubFeed(page, feed);
  await page.addInitScript(([p]) => { localStorage.setItem('publicKey', p); localStorage.setItem('sunmint_lang', 'en'); }, [PUB]);
  await page.goto('/my-trees/?tx=' + encodeURIComponent(shared));
  await expect(page.locator('.tree-card.is-selected')).toHaveCount(2);
  await expect(page.locator('#count')).toContainText('matches 2 trees');
});

test('a ?tx= deep link that matches nothing shows the honest no-match notice', async ({ page }) => {
  await openWithKey(page);
  await page.waitForSelector('.tree-card');
  await page.goto('/my-trees/?tx=' + encodeURIComponent('NOPE_does_not_exist'));
  await expect(page.locator('.tree-card.is-selected')).toHaveCount(0);
});

// ── Gary 2026-09-29: the deep link must work for a visitor with NO identity ──
// A governor copies the transaction request id (or its ?tx= link) and sends it
// to a payee via WhatsApp. The payee holds no planting key, so the page must
// serve a PUBLIC, read-only view of exactly the linked tree(s) -- not the
// no-identity dead end, and never the whole feed.

function publicFeed() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature', geometry: { type: 'Point', coordinates: [-39.0, -13.0] },
        properties: {
          tree_id: 'PAYEE_TREE', species: 'Cacao - Criolla',
          photo_url: 'https://example.com/p.jpg', status: 'LINKED',
          qr_code: 'QR_PAYEE', last_measured: '2026-09-10T00:00:00Z',
          program: 'crf-anapu', request_txid: 'Edgar_20260910120000_900_PAYEESIG',
          pk_hash: 'pk-SOMEONEELSE999',
        },
      },
      {
        type: 'Feature', geometry: { type: 'Point', coordinates: [-39.1, -13.1] },
        properties: {
          tree_id: 'NOT_LINKED', species: 'Cacao - Trinitario',
          photo_url: 'https://example.com/n.jpg', status: 'NEW',
          request_txid: 'Edgar_20260910120001_901_OTHER', pk_hash: 'pk-OTHERPERSON99',
        },
      },
    ],
  };
}

async function openKeyless(page, query) {
  await page.route('**/trees/index.geojson*', (r) => r.fulfill({ json: publicFeed() }));
  await page.addInitScript(() => {
    localStorage.removeItem('publicKey');
    localStorage.setItem('sunmint_lang', 'en');
  });
  await page.goto('/my-trees/' + (query || ''));
}

test('KEYLESS ?tx= link shows a public read-only view of the linked tree (Gary)', async ({ page }) => {
  await openKeyless(page, '?tx=' + encodeURIComponent('Edgar_20260910120000_900_PAYEESIG'));
  await page.waitForSelector('.tree-card');
  // exactly the linked tree, expanded and selected -- NOT the unrelated one
  await expect(page.locator('.tree-card')).toHaveCount(1);
  const card = page.locator('.tree-card[data-tree="PAYEE_TREE"]');
  await expect(card).toHaveCount(1);
  await expect(page.locator('.tree-card[data-tree="NOT_LINKED"]')).toHaveCount(0);
  await expect(card).toHaveClass(/is-selected/);
  await expect(card.locator('.tc-details')).toBeVisible();
  await expect(page.locator('#status')).toContainText(/Public view|Visão pública/);
});

test('KEYLESS ?tree= link shows the linked tree (Gary)', async ({ page }) => {
  await openKeyless(page, '?tree=' + encodeURIComponent('PAYEE_TREE'));
  await page.waitForSelector('.tree-card');
  await expect(page.locator('.tree-card')).toHaveCount(1);
  await expect(page.locator('.tree-card[data-tree="PAYEE_TREE"]')).toHaveCount(1);
});

test('KEYLESS visitor with NO link still gets the honest no-identity state', async ({ page }) => {
  await openKeyless(page, '');
  await expect(page.locator('#status')).toContainText(/No planting identity|Nenhuma identidade/);
  expect(await page.locator('.tree-card').count()).toBe(0);
});

test('KEYLESS ?tx= link that matches nothing shows the honest deepLinkNoMatch', async ({ page }) => {
  await openKeyless(page, '?tx=' + encodeURIComponent('NOPE_not_a_txid'));
  await expect(page.locator('#status')).toContainText(/No tree matches|Nenhuma árvore corresponde/);
  expect(await page.locator('.tree-card').count()).toBe(0);
});

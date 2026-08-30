const GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-39.0, -13.0] },
      properties: {
        tree_id: 'TREE_A',
        species: 'Cacao - Criolla',
        photo_url: 'https://example.com/a.jpg',
        status: 'NEW',
        qr_code: null,
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-39.0, -13.0] },
      properties: {
        tree_id: 'TREE_B',
        species: 'Cacao - Trinitario',
        photo_url: 'https://example.com/b.jpg',
        status: 'NEW',
        qr_code: null,
      },
    },
  ],
};

// Stub the governor identity check so the MARK INVALID gate passes.
async function stubGovernor(page) {
  await page.route('**/dao/check_digital_signature*', (route) =>
    route.fulfill({
      json: {
        registered: true,
        contributor_name: 'Gary Teh',
        contributor_email: 'garyjob@gmail.com',
        is_governor: true,
        is_sentinel: false,
      },
    })
  );
}

// Stub the tree index fetch. Set fail=true to simulate being offline.
async function stubTreeIndex(page, { fail = false } = {}) {
  await page.route('**/trees/index.geojson*', (route) => {
    if (fail) return route.abort();
    return route.fulfill({ json: GEOJSON });
  });
}

// Stub Edgar submissions (REJECT / email link / verification events).
async function stubSubmit(page, onSubmit) {
  await page.route('**/dao/submit_contribution', (route) => {
    if (onSubmit) onSubmit();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"ok":true}',
    });
  });
}

module.exports = { GEOJSON, stubGovernor, stubTreeIndex, stubSubmit };

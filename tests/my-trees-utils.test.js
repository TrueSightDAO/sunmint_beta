/**
 * Unit tests for my-trees-utils.js
 * Run: node tests/my-trees-utils.test.js
 *
 * The privacy-critical assertions are:
 *   - only an exact pk_hash match is kept (no fuzzy / no wildcard)
 *   - a raw public key is NEVER an input or an output of these helpers
 *   - an empty viewer pk_hash yields zero trees (never "all trees")
 *
 * The interface-contract assertion is that a feature built from
 * PayoutRegistrationUtils.derivePkHash(...) is exactly what
 * my-trees-utils.filterTreesByPkHash(...) selects -- i.e. the writer (sunmint
 * build_tree_geojson.py) and the reader (this page) agree on pk_hash.
 */
const assert = require('assert');
const M = require('../my-trees-utils.js');
const U = require('../payout-registration-utils.js');

let passed = 0;
function test(name, fn) {
    return Promise.resolve().then(fn).then(() => { passed++; console.log('  ok  ' + name); })
        .catch((e) => { console.error('  FAIL ' + name + '\n      ' + e.message); process.exitCode = 1; });
}

const PK_A = 'pk-AAAAAAAAAAAA';
const PK_B = 'pk-BBBBBBBBBBBB';

function feat(pk, id, extra) {
    return { type: 'Feature', properties: Object.assign({ pk_hash: pk, tree_id: id }, extra || {}) };
}

(async function run() {
    await test('filterTreesByPkHash keeps only exact matches', () => {
        const feed = [feat(PK_A, 'T1'), feat(PK_B, 'T2'), feat(PK_A, 'T3')];
        const mine = M.filterTreesByPkHash(feed, PK_A);
        assert.deepStrictEqual(mine.map(f => f.properties.tree_id), ['T1', 'T3']);
    });

    await test('a sibling pk_hash is never included (no prefix/substring match)', () => {
        const feed = [feat(PK_A, 'T1'), feat(PK_A + 'ZZZ', 'T2'), feat('pk-AAAAAAAAAA', 'T3')];
        const mine = M.filterTreesByPkHash(feed, PK_A);
        assert.strictEqual(mine.length, 1);
        assert.strictEqual(mine[0].properties.tree_id, 'T1');
    });

    await test('empty / missing viewer pk_hash yields zero trees, never all', () => {
        const feed = [feat(PK_A, 'T1'), feat(PK_B, 'T2')];
        assert.deepStrictEqual(M.filterTreesByPkHash(feed, ''), []);
        assert.deepStrictEqual(M.filterTreesByPkHash(feed, null), []);
        assert.deepStrictEqual(M.filterTreesByPkHash(feed, '   '), []);
    });

    await test('features without pk_hash are never selected', () => {
        const feed = [{ properties: { tree_id: 'T1' } }, { properties: {} }, feat(PK_A, 'T2')];
        assert.strictEqual(M.filterTreesByPkHash(feed, PK_A).length, 1);
    });

    await test('non-array / malformed input degrades to [] (no throw)', () => {
        assert.deepStrictEqual(M.filterTreesByPkHash(null, PK_A), []);
        assert.deepStrictEqual(M.filterTreesByPkHash(undefined, PK_A), []);
        assert.deepStrictEqual(M.filterTreesByPkHash({}, PK_A), []);
    });

    await test('countWithPkHash counts only rows that actually carry a pk_hash', () => {
        const feed = [feat(PK_A, 'T1'), { properties: {} }, feat(PK_B, 'T2'), { properties: { pk_hash: '  ' } }];
        assert.strictEqual(M.countWithPkHash(feed), 2);
        assert.strictEqual(M.countWithPkHash([]), 0);
        assert.strictEqual(M.countWithPkHash(null), 0);
    });

    await test('sortByLastMeasured is newest-first and sinks undated trees', () => {
        const feed = [
            feat(PK_A, 'old', { last_measured: '2026-01-01T00:00:00Z' }),
            feat(PK_A, 'new', { last_measured: '2026-09-01T00:00:00Z' }),
            feat(PK_A, 'none')
        ];
        const ids = M.sortByLastMeasured(feed).map(f => f.properties.tree_id);
        assert.deepStrictEqual(ids, ['new', 'old', 'none']);
    });

    await test('sortByLastMeasured does not mutate its input', () => {
        const feed = [feat(PK_A, 'a', { last_measured: '2026-01-01' }), feat(PK_A, 'b', { last_measured: '2026-02-01' })];
        const before = feed.map(f => f.properties.tree_id);
        M.sortByLastMeasured(feed);
        assert.deepStrictEqual(feed.map(f => f.properties.tree_id), before);
    });

    await test('normalizeStatus maps to the known set, else empty', () => {
        assert.strictEqual(M.normalizeStatus('linked'), 'LINKED');
        assert.strictEqual(M.normalizeStatus(' sold '), 'SOLD');
        assert.strictEqual(M.normalizeStatus('NEW'), 'NEW');
        assert.strictEqual(M.normalizeStatus('INVALID'), 'INVALID');
        assert.strictEqual(M.normalizeStatus('weird'), '');
        assert.strictEqual(M.normalizeStatus(null), '');
    });

    await test('end-to-end: derivePkHash output selects the feature built from it', async () => {
        const spkiB64 = Buffer.from('stand-in spki bytes for the interface test').toString('base64');
        const h = await U.derivePkHash(spkiB64);
        assert.ok(U.isValidPkHash(h), 'derivePkHash must yield a valid pk_hash');
        const feed = [feat(h, 'MINE'), feat(PK_B, 'THEIRS')];
        const mine = M.filterTreesByPkHash(feed, h);
        assert.deepStrictEqual(mine.map(f => f.properties.tree_id), ['MINE']);
    });

    await test('privacy: raw public key never appears in this module', () => {
        let src = require('fs').readFileSync(require('path').join(__dirname, '..', 'my-trees-utils.js'), 'utf8');
        // Scan CODE only -- the contract docstring intentionally names these terms.
        src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        // 'publicKey'/'pixKey'/'cpf' must not be read or emitted here (only pk_hash).
        assert.ok(!/publicKey|privateKey|pixKey|cpf/i.test(src), 'utils must not touch raw key PII');
    });

    console.log('\nmy-trees-utils: ' + passed + ' passed' + (process.exitCode ? ', FAILURES' : ', 0 failed'));
})();

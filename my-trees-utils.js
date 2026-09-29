/**
 * My Trees - client-side filter utilities (isomorphic: browser + Node).
 *
 * Option 2 of the "My Trees" module: NO server endpoint, NO per-user query.
 * The public trees/index.geojson already carries, per tree, a canonical
 * content-addressed handle for the signer's key:
 *
 *     pk_hash = 'pk-' + base64url(sha256(spki(publicKey)))[:12]
 *
 * (emitted by sunmint/scripts/build_tree_geojson.py from the tree's signing
 * key -- the same value the planting app and payout form derive locally). The
 * viewer's browser derives its OWN pk_hash from the keypair it already holds in
 * localStorage and keeps only the matching features -- so the shared public
 * feed never carries the raw key blob.
 *
 * WHAT THIS DOES AND DOES NOT HIDE: pk_hash is derived from the RSA public key,
 * which is public by construction -- anyone holding that key re-derives the same
 * handle, so it is an opaque *join key*, not an anonymiser. What actually protects
 * a person is that the key<->name/email/PIX map lives only in the private DAO
 * member cache, never in the public feed. See
 * agentic_ai_context/conventions/DEDUP_KEY_CONVENTION.md 2.6.
 *
 * CONTRACT: a raw public key, name, email, PIX key or CPF never belongs in this
 * file's inputs or outputs. Only the derived pk_hash does.
 */
(function (global) {
    function _str(v) { return (v === null || v === undefined) ? '' : String(v); }

    /** True if a GeoJSON feature's properties.pk_hash equals the given pk_hash. */
    function featureMatchesPkHash(feature, pkHash) {
        var want = _str(pkHash).trim();
        if (!want) return false;
        var p = (feature && feature.properties) || {};
        return _str(p.pk_hash).trim() === want;
    }

    /** Keep only the features whose properties.pk_hash equals pkHash. */
    function filterTreesByPkHash(features, pkHash) {
        var list = Array.isArray(features) ? features : [];
        var want = _str(pkHash).trim();
        if (!want) return [];
        return list.filter(function (f) { return featureMatchesPkHash(f, want); });
    }

    /** Newest last_measured first; trees missing a date sink to the bottom. */
    function sortByLastMeasured(features) {
        var list = Array.isArray(features) ? features.slice() : [];
        return list.sort(function (a, b) {
            var da = _str((a.properties || {}).last_measured);
            var db = _str((b.properties || {}).last_measured);
            if (!da && !db) return 0;
            if (!da) return 1;
            if (!db) return -1;
            return da < db ? 1 : (da > db ? -1 : 0);
        });
    }

    var KNOWN_STATUSES = ['NEW', 'INVALID', 'LINKED', 'SOLD'];

    /** Normalize a tree status to one of the known set ('' if not recognized). */
    function normalizeStatus(status) {
        var s = _str(status).trim().toUpperCase();
        return KNOWN_STATUSES.indexOf(s) >= 0 ? s : '';
    }

    /**
     * How many features carry a pk_hash at all. Lets the page tell "the public
     * feed has not been rebuilt with identity data yet" apart from
     * "your key legitimately owns zero trees".
     */
    function countWithPkHash(features) {
        var list = Array.isArray(features) ? features : [];
        return list.reduce(function (n, f) {
            var p = (f && f.properties) || {};
            return n + (_str(p.pk_hash).trim() ? 1 : 0);
        }, 0);
    }

    /**
     * Keep features whose tree_id or request_txid CONTAINS the query
     * (case-insensitive). Unlike filterTreesByPkHash, a BLANK query returns the
     * whole list: this backs a free-text filter box, where "empty" means
     * "no filter", not "own nothing". Never touches raw key material.
     */
    function featureMatchesQuery(feature, query) {
        var q = _str(query).trim().toLowerCase();
        if (!q) return true;
        var p = (feature && feature.properties) || {};
        return _str(p.request_txid).toLowerCase().indexOf(q) >= 0
            || _str(p.tree_id).toLowerCase().indexOf(q) >= 0;
    }

    function filterByQuery(features, query) {
        var list = Array.isArray(features) ? features : [];
        var q = _str(query).trim().toLowerCase();
        if (!q) return list.slice();
        return list.filter(function (f) { return featureMatchesQuery(f, q); });
    }

    /**
     * Features whose request_txid CONTAINS txid (case-insensitive substring).
     * Backs the ?tx=<transaction request id> deep link (Gary 2026-09-29): a
     * governor copies the id (or its link) and shares it with a payee, and the
     * matching tree scrolls into view. A full 344-char id is one-per-tree in
     * practice, but the public feed can carry duplicate rows for a submission
     * (observed 148 distinct ids / 154 trees), so return ALL matches and let
     * the page reveal a count instead of silently picking one.
     */
    function featuresMatchingTxid(features, txid) {
        var list = Array.isArray(features) ? features : [];
        var q = _str(txid).trim().toLowerCase();
        if (!q) return [];
        return list.filter(function (f) {
            var p = (f && f.properties) || {};
            return _str(p.request_txid).toLowerCase().indexOf(q) >= 0;
        });
    }

    // PR4 cross-link (plans/TRUESIGHT_LEDGER_EXPLORER_PLAN.md): a tree's
    // `tree_id` (e.g. Edgar_20260821175134_006) equals the ledger TREE PLANTING
    // event's `telegram_message_id`, so the public Ledger Explorer resolves the
    // tree's planting/payout receipt directly via ?q=<tree_id>.
    var LEDGER_EXPLORER_URL = 'https://beta.dapp.truesight.me/ledger_explorer.html';

    /** Deep-link into the Ledger Explorer for a tree id ('' when no id). */
    function buildLedgerLink(treeId) {
        var id = _str(treeId).trim();
        if (!id) return '';
        return LEDGER_EXPLORER_URL + '?q=' + encodeURIComponent(id);
    }

    /**
     * Lifecycle milestones derivable from the PUBLIC tree feed ONLY.
     * Ordered [{key, ok, detail}]. We never invent a state the feed cannot
     * prove -- e.g. 'paid'/'monitored' live in the DAO ledger, not the public
     * geojson, so they are deliberately ABSENT rather than guessed.
     */
    function milestones(props) {
        var p = props || {};
        var st = normalizeStatus(p.status);
        return [
            { key: 'msPlanted', ok: !!_str(p.last_measured).trim(), detail: _str(p.last_measured).slice(0, 10) },
            { key: 'msPhoto', ok: !!_str(p.photo_url).trim(), detail: '' },
            { key: 'msQrLinked', ok: !!_str(p.qr_code).trim(), detail: _str(p.qr_code).trim() },
            { key: 'msSigned', ok: !!_str(p.request_txid).trim(), detail: '' },
            { key: 'msSold', ok: st === 'SOLD', detail: '' }
        ];
    }

    var utils = {
        LEDGER_EXPLORER_URL: LEDGER_EXPLORER_URL,
        buildLedgerLink: buildLedgerLink,
        featureMatchesPkHash: featureMatchesPkHash,
        filterTreesByPkHash: filterTreesByPkHash,
        filterByQuery: filterByQuery,
        featuresMatchingTxid: featuresMatchingTxid,
        sortByLastMeasured: sortByLastMeasured,
        normalizeStatus: normalizeStatus,
        milestones: milestones,
        countWithPkHash: countWithPkHash,
        KNOWN_STATUSES: KNOWN_STATUSES
    };

    global.MyTreesUtils = utils;
    if (typeof module !== 'undefined' && module.exports) module.exports = utils;
})(typeof window !== 'undefined' ? window : this);

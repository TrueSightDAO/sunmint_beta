/**
 * My Trees - client-side filter utilities (isomorphic: browser + Node).
 *
 * Option 2 of the "My Trees" module: NO server endpoint, NO per-user query.
 * The public trees/index.geojson already carries, per tree, a non-reversible
 * pseudonym
 *
 *     pk_hash = 'pk-' + base64url(sha256(spki(publicKey)))[:12]
 *
 * (emitted by sunmint/scripts/build_tree_geojson.py from the tree's signing
 * key -- the same value the planting app and payout form derive locally). The
 * viewer's browser derives its OWN pk_hash from the keypair it already holds in
 * localStorage and keeps only the matching features -- so the raw key never
 * leaves the device and the shared public feed stays anonymous.
 *
 * PRIVACY CONTRACT: a raw public key, name, email, PIX key or CPF never belongs
 * in this file's inputs or outputs. Only the derived pk_hash does.
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

    var utils = {
        featureMatchesPkHash: featureMatchesPkHash,
        filterTreesByPkHash: filterTreesByPkHash,
        sortByLastMeasured: sortByLastMeasured,
        normalizeStatus: normalizeStatus,
        countWithPkHash: countWithPkHash,
        KNOWN_STATUSES: KNOWN_STATUSES
    };

    global.MyTreesUtils = utils;
    if (typeof module !== 'undefined' && module.exports) module.exports = utils;
})(typeof window !== 'undefined' ? window : this);

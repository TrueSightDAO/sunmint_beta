# Vendor-readiness audit (PR1 — CRF Anapu × SunMint cohort, Option B)

Scope: make the `sunmint_beta` app safe to **vendor-copy** into another repo
(`cfr-anapu`) served from a **different domain**, so submissions self-attribute
to that vendor origin with zero app-code change (`Submission Source:
${window.location.href}`).

## 1. What was fixed in this repo (PR1)

- `limites-da-fazenda/index.html` hardcoded `'Submission Source':
  'sunmint-limites-da-fazenda'` → now `window.location.href`. This was the *only*
  flow that pinned a literal; the planting (`index.html`) and monitoring
  (`monitor-tree-growth/index.html`) flows already used the running origin.
  Without this, a vendored copy of the boundary flow would keep reporting the
  sunmint origin and every CRF Anapu plot submission would be misattributed.

## 2. Absolute self-refs a *vendor* must rewrite (not fixed here — domain-specific)

These are correct for `sunmint.truesight.me`; the vendor step (PR2) rewrites the
**self-referential** ones to the vendor domain. API/verify endpoints stay canonical.

| File | Line | Ref | Vendor action |
|---|---|---|---|
| `index.html` | 13 | `<meta property="og:url">` = `https://sunmint.truesight.me/` | rewrite → vendor origin |
| `monitor-tree-growth/index.html` | 12 | `og:url` = `…/monitor-tree-growth/` | rewrite |
| `instrucoes/index.html` | 13 | `og:url` = `…/instrucoes/` | rewrite |
| `index.html` | 320 | APK download `…/sunmint-android.apk` | keep (same binary) or repoint |
| `monitor-tree-growth/index.html` | 1286 | APK download | keep or repoint |
| `limites-da-fazenda/index.html` | 173 | APK download | keep or repoint |
| `*` | — | `https://edgar.truesight.me`, `https://dapp.truesight.me/verify_request.html` | **keep canonical** (DAO API) |
| `monitor-tree-growth/index.html` | 444–446 | `trees/index.geojson` (sunmint/beta/truesight mirrors) | **keep canonical** (shared tree data) |

`og:url` / `og:image` are read by link-preview crawlers that do not run JS, so
they cannot be derived at runtime — they must be rewritten at vendor time (PR2).

## 3. Navigation & assets — already vendor-safe

- All in-app nav is **root-relative** (`/`, `/monitor-tree-growth/`,
  `/limites-da-fazenda/`, `/instrucoes/`). Served from the **root** of a vendor
  domain these resolve within that origin → the vendored copy stays self-contained
  and never bounces to `sunmint.truesight.me`. (Deploying under a *subpath* would
  break them — the plan keeps the app at the vendor root.)
- Each page is a single self-contained `index.html` with inline `<style>`/`<script>`;
  no cross-file `js/`/`css/` asset references to rewrite.

## 4. Service worker — no cross-origin collision

`service-worker.js` registers at `/service-worker.js` with `scope: '/'` and uses
`CACHE_NAME = 'sunmint-cache-v2'`. **Cache Storage and SW scope are per-origin**,
so a vendored copy on `cfr.truesight.me` gets its own registration and cache
storage bucket — it cannot read, overwrite, or collide with
`sunmint.truesight.me`'s entries even though the cache name is identical.
Offline pre-cache list is relative (`./…`) plus canonical data JSONs — both fine
from a new origin. **No change required.** (Must stay at the vendor root, same as
the nav constraint above.)

# sunmint_beta

Sunmint Farmer App — simplified email-link + tree-planting report, TrueSight DAO.

Deployed at **beta.sunmint.truesight.me** via GitHub Pages.

This is the working base. All changes land here first; `sunmint_prod` (deployed at
**sunmint.truesight.me**) is a GitHub **fork** of this repo, promoted via:

```bash
gh repo sync TrueSightDAO/sunmint_prod --source TrueSightDAO/sunmint_beta
```

**⚠️ Never edit `CNAME` here to anything other than `beta.sunmint.truesight.me`.**
`sunmint_prod`'s `CNAME` (`sunmint.truesight.me`) is a deliberately-diverged file —
`gh repo sync` only fast-forwards commits, so it never touches a file that beta
doesn't also change. If beta's CNAME is ever edited, that change *will* flow into
prod on the next sync and silently break the live domain (this is exactly what
happened to `truesight_me_prod` on 2025-11-30 — its CNAME got overwritten with
`beta.truesight.me` during a promotion, breaking truesight.me for months
undetected).

## What this app does

Single self-contained `index.html`, no build step, bilingual (PT default / EN toggle).
Two flows, both reusing the same RSA identity + Edgar submission mechanism as
`dapp/create_signature.html` and `dapp/report_tree_planting.html`:

1. **Link email** — `EMAIL REGISTERED EVENT` / `EMAIL VERIFICATION EVENT`, same flow as
   `dapp/create_signature.html`. RSA keypair (SPKI/PKCS8, base64) generated on first use and
   stored in `localStorage['publicKey'/'privateKey']` — reuses dapp's keys if the farmer
   already has an account.
2. **Report a tree planting** — signed `[TREE PLANTING EVENT]` with a photo attached. See
   "Offline queue" below — this is the part that isn't a straight copy of the dapp page.

## Offline queue (why `submitTreePlanting()` looks the way it does)

**Problem:** farms often have no internet connection. A plain "sign + `fetch()`" submit (what
`dapp/report_tree_planting.html` does) fails outright when offline, and the farmer has to
retype the whole report later.

**Fix — queue-then-flush, not submit-then-fail:**

1. **Sign immediately, at capture time** (`submitTreePlanting()`). The signed `shareText`'s
   `Planting Time` reflects the real moment of the report, not whenever a connection is
   later found — signing doesn't need the network, only `crypto.subtle`.
2. **Queue the signed text + the photo blob in IndexedDB** (`queueTreeReport()`, db
   `sunmint_offline`, store `tree_reports`, one record per report:
   `{id, shareText, photoBlob, photoName, createdAt, uploaded, uploadedAt}`).
   IndexedDB, not `localStorage` — photos are binary blobs, and a farmer capturing many
   trees in one offline session would quickly blow past `localStorage`'s ~5-10MB
   same-origin quota. IndexedDB natively stores `Blob`/`File` objects with a much larger
   quota, no base64 encoding needed.
3. **Reset the form immediately** after queuing, regardless of what happens next — the
   farmer can capture the next tree right away without waiting on any network round-trip.
4. **Flush the queue** (`flushTreeReportQueue()`): scans IndexedDB for `uploaded: false`
   records and `fetch()`s each to Edgar. Runs after every new report is queued, on page
   load (`updatePendingBadge()` + `flushTreeReportQueue()` in the init block — this is the
   "farmer walks back into cell signal, opens the page again" case), and on the browser's
   `online` event (catches "signal comes back while the page is still open" without
   needing a reload). A record that fails to upload (still offline) is simply left
   `uploaded: false` for the next attempt — no retry-count, no backoff, no giving up.
5. **Edgar `409` counts as success** (`uploadTreeReport()`) — Edgar returns 409 when it's
   already processed that exact signed request, which happens when a prior flush attempt
   succeeded server-side but the client never saw the response (flaky rural connections
   drop mid-response more often than mid-request). Without this, that report would retry
   forever even though Edgar already has it.
6. **`#pendingBadge`** (`updatePendingBadge()`) shows "N reports pending upload" so the
   farmer isn't left guessing whether anything is actually queued.

**Prior art**: this mirrors `capoeira/assets/js/practice-event-submit.js` — a `localStorage`
session-history array with a `submitted_at` marker, and a `backfillUnsent()` scan on page
load that resubmits anything missing that marker. Same shape (immediate-attempt,
leave-unmarked-on-failure, rescan-on-load), swapped to IndexedDB here because of the photo
blobs. If you're touching either file, read the other one first — keeping the two patterns
recognizably similar is the point.

Before changing this flow, re-read this section — the failure mode being guarded against
(a farmer loses a report because the app assumed connectivity) is the whole reason this
exists, and it's easy to accidentally regress by going back to a plain submit-or-fail
`fetch()`.

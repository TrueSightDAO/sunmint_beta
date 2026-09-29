"""Regression guard: PWA service-worker update self-heal.

Locks in the 2026-09-29 fix for "returning visitors serve pre-fix HTML":
the SW cache name is bumped and every app page wires the shared
`/sw-update.js`, which surfaces a "reload to update" prompt and pairs with
the SW's SKIP_WAITING message hook. Prevents a silent regression back to a
pinned cache with no user-facing way out.
"""

import os
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAGES = [
    "index.html",
    "monitor-tree-growth/index.html",
    "limites-da-fazenda/index.html",
    "my-trees/index.html",
]


def _read(rel):
    with open(os.path.join(REPO, rel), encoding="utf-8") as f:
        return f.read()


class SwUpdateTest(unittest.TestCase):
    def test_cache_name_bumped_to_v12(self):
        sw = _read("service-worker.js")
        self.assertIn("const CACHE_NAME = 'sunmint-cache-v12';", sw)

    def test_sw_has_skip_waiting_message_hook(self):
        sw = _read("service-worker.js")
        self.assertIn("SKIP_WAITING", sw)
        self.assertIn("self.skipWaiting()", sw)

    def test_shared_update_script_exists_and_is_wired(self):
        js = _read("sw-update.js")
        self.assertIn("controllerchange", js)
        self.assertIn("SKIP_WAITING", js)
        self.assertIn("/service-worker.js", js)

    def test_every_page_includes_shared_update_script(self):
        for page in PAGES:
            self.assertIn(
                '<script src="/sw-update.js"></script>',
                _read(page),
                f"{page} must include the shared sw-update.js",
            )

    def test_no_page_has_a_stale_inline_register_block(self):
        for page in PAGES:
            self.assertNotIn(
                "navigator.serviceWorker.register",
                _read(page),
                f"{page} must delegate registration to sw-update.js",
            )


if __name__ == "__main__":
    unittest.main()

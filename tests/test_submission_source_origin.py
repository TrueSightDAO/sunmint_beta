"""PR1 (CRF Anapu x SunMint cohort -- vendor-readiness) regression guard.

Every submission flow must stamp `Submission Source` from the *running* origin
(`window.location.href`), never a hardcoded literal, so that a vendored copy of
the app served from `cfr.truesight.me` self-attributes to the CRF origin with
zero app-code change (plan section 2.1, Option B).

Regression context: `limites-da-fazenda/index.html` shipped with the literal
`'sunmint-limites-da-fazenda'`, while the planting (`index.html`) and monitoring
(`monitor-tree-growth/index.html`) flows already used `window.location.href`.
A vendored copy of the boundary flow would therefore have kept reporting the
sunmint origin, misattributing every CRF Anapu plot submission.
"""

import os
import re
import subprocess
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = [
    "index.html",
    "monitor-tree-growth/index.html",
    "limites-da-fazenda/index.html",
]


def read(path):
    with open(os.path.join(REPO, path), encoding="utf-8") as f:
        return f.read()


class TestSubmissionSourceOrigin(unittest.TestCase):
    def test_no_hardcoded_boundary_origin_literal(self):
        for page in PAGES:
            self.assertNotIn("sunmint-limites-da-fazenda", read(page), page)

    def test_boundary_flow_stamps_running_origin(self):
        html = read("limites-da-fazenda/index.html")
        self.assertIn("'Submission Source': window.location.href", html)

    def test_every_submission_source_line_is_origin_based(self):
        for page in PAGES:
            lines = [ln for ln in read(page).splitlines() if "Submission Source" in ln]
            self.assertGreaterEqual(len(lines), 1, f"{page}: no Submission Source line")
            for line in lines:
                self.assertIn(
                    "window.location.href",
                    line,
                    f"{page}: Submission Source not origin-based -> {line.strip()!r}",
                )

    def test_inline_scripts_parse(self):
        for page in PAGES:
            html = read(page)
            for i, s in enumerate(re.findall(r"<script>(.*?)</script>", html, re.S)):
                with open("/tmp/_ss_check.js", "w", encoding="utf-8") as f:
                    f.write(s)
                r = subprocess.run(
                    ["node", "--check", "/tmp/_ss_check.js"],
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(
                    r.returncode, 0, f"{page} script {i}: {r.stderr[:200]}"
                )


if __name__ == "__main__":
    unittest.main()

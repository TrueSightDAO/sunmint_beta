"""Regression guard: the sunmint nav-dropdown UI convention.

Locks in the standardized nav dropdown (PR #59) so every page on
sunmint.truesight.me renders the same dropdown UI:
  - exactly one .nav-dropdown with #pageNav select per page
  - reference CSS: centered, margin-bottom 1rem, select max-width 300px inline-block
  - all 5 nav options present (plant/monitor/farm/limites/instrucoes)
  - the page's own option is selected
  - onNavChange defined and routes every option
  - pt + en i18n keys present for every nav option
"""

import os
import re
import subprocess
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = [
    "index.html",
    "monitor-tree-growth/index.html",
    "instrucoes/index.html",
    "limites-da-fazenda/index.html",
    "register_farm/index.html",
]
NAV_OPTIONS = ["plant", "monitor", "farm", "limites", "instrucoes"]
# page -> the option that should be selected on it
EXPECTED_SELECTED = {
    "index.html": "plant",
    "monitor-tree-growth/index.html": "monitor",
    "instrucoes/index.html": "instrucoes",
    "limites-da-fazenda/index.html": "limites",
    "register_farm/index.html": "farm",
}
REFERENCE_CSS = {
    ".nav-dropdown": ["margin-bottom: 1rem", "text-align: center"],
    ".nav-dropdown select": ["max-width: 300px", "display: inline-block"],
    ".nav-dropdown label": ["font-weight: bold", "display: inline"],
}


def read(page):
    with open(os.path.join(REPO, page), encoding="utf-8") as f:
        return f.read()


class TestNavUI(unittest.TestCase):
    def test_all_pages_have_exactly_one_nav_dropdown(self):
        for page in PAGES:
            html = read(page)
            self.assertEqual(html.count('class="nav-dropdown"'), 1, page)
            self.assertEqual(html.count('id="pageNav"'), 1, page)
            self.assertIn('onchange="onNavChange()"', html, page)

    def test_reference_css_present_on_every_page(self):
        for page in PAGES:
            html = read(page)
            for selector, props in REFERENCE_CSS.items():
                # find the rule block for this selector
                m = re.search(re.escape(selector) + r"\s*\{([^}]*)\}", html)
                self.assertIsNotNone(m, f"{page}: missing rule {selector}")
                for prop in props:
                    self.assertIn(
                        prop, m.group(1), f"{page}: {selector} missing {prop!r}"
                    )

    def test_all_nav_options_present(self):
        for page in PAGES:
            html = read(page)
            nav_block = re.search(r'id="pageNav".*?</select>', html, re.S)
            self.assertIsNotNone(nav_block, page)
            for opt in NAV_OPTIONS:
                self.assertIn(
                    f'value="{opt}"',
                    nav_block.group(0),
                    f"{page}: missing option {opt}",
                )

    def test_selected_option_matches_page(self):
        for page, expected in EXPECTED_SELECTED.items():
            html = read(page)
            sel = re.search(r'value="([a-z]+)"[^>]*selected', html)
            self.assertIsNotNone(sel, page)
            self.assertEqual(sel.group(1), expected, page)

    def test_onnavchange_defined_and_routes_every_option(self):
        for page in PAGES:
            html = read(page)
            self.assertRegex(html, r"function\s+onNavChange", page)
            for opt in NAV_OPTIONS:
                self.assertRegex(html, r'["\']' + opt + r'["\']', page)

    # register_farm uses the Google-Translate engine (setLang -> setLanguage),
    # so it has no JS nav dict — exempt from the dict assertion.
    DICT_PAGES = [p for p in PAGES if p != "register_farm/index.html"]

    def test_i18n_nav_keys_in_pt_and_en(self):
        for page in self.DICT_PAGES:
            html = read(page)
            for opt in NAV_OPTIONS:
                key = f"nav{opt.capitalize()}"
                self.assertGreaterEqual(
                    html.count(key), 2, f"{page}: {key} in both dicts"
                )

    def test_inline_scripts_parse(self):
        for page in PAGES:
            html = read(page)
            scripts = re.findall(r"<script>(.*?)</script>", html, re.S)
            self.assertGreaterEqual(len(scripts), 1, page)
            for i, s in enumerate(scripts):
                with open("/tmp/_nav_check.js", "w", encoding="utf-8") as f:
                    f.write(s)
                r = subprocess.run(
                    ["node", "--check", "/tmp/_nav_check.js"],
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(
                    r.returncode, 0, f"{page} script {i}: {r.stderr[:200]}"
                )


if __name__ == "__main__":
    unittest.main()

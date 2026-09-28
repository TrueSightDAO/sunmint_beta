"""Regression guard: My Trees i18n parity + live-retranslation.

Gary (2026-09-28): "My trees section still in English even when I switch to
Portuguese." Two root causes, both locked down here:

  1. The `pt` dictionary was missing keys that `en` had (lblStatus, lblSource,
     monitorThis), so in Portuguese those labels rendered as raw key strings.
     -> test_dict_key_parity

  2. setLang() only re-translated static [data-i18n] nodes; the JS-rendered
     count + tree cards kept whatever language they were first rendered in
     until a reload. -> test_setlang_retranslates_dynamic_content
"""

import os
import re
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = "my-trees/index.html"

_STR = re.compile(r"'(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\"", re.S)
_KEY = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)\s*:")


def read_page():
    with open(os.path.join(REPO, PAGE), encoding="utf-8") as f:
        return f.read()


def _block(html, opener):
    """Return the {..} body starting at the first `opener` (brace-balanced)."""
    i = html.index("{", html.index(opener))
    depth = 0
    for j in range(i, len(html)):
        if html[j] == "{":
            depth += 1
        elif html[j] == "}":
            depth -= 1
            if depth == 0:
                return html[i + 1 : j]
    raise AssertionError(f"unbalanced braces after {opener!r}")


def dict_keys(html, lang):
    """Keys defined in the I18N.<lang> {...} object literal (string-safe)."""
    body = _block(html, re.search(r"\b%s\s*:\s*\{" % lang, html).group(0))
    body = _STR.sub("''", body)  # drop string literals so 'Page:' isn't a key
    return set(_KEY.findall(body))


class TestMyTreesI18n(unittest.TestCase):
    def setUp(self):
        self.html = read_page()

    def test_dict_key_parity(self):
        pt, en = dict_keys(self.html, "pt"), dict_keys(self.html, "en")
        self.assertTrue(pt, "no pt keys parsed")
        self.assertTrue(en, "no en keys parsed")
        self.assertEqual(
            [],
            sorted(en - pt),
            "keys in en but not pt (would render as raw keys in Portuguese)",
        )

    def test_setlang_retranslates_dynamic_content(self):
        fn = re.search(r"function setLang\b", self.html)
        self.assertIsNotNone(fn, "setLang not found")
        body = _block(self.html, "function setLang")
        self.assertIn("retranslate()", body, "setLang() must retranslate() dynamic nodes")
        self.assertRegex(self.html, r"function retranslate\s*\(\s*\)")
        self.assertRegex(self.html, r"function renderTrees\s*\(")

    def test_dynamic_labels_use_t_helper(self):
        for key in ("lblSpecies", "lblMeasured", "lblSource", "monitorThis", "countMany"):
            self.assertIn(f"t('{key}')", self.html, f"{key} must go through t()")


if __name__ == "__main__":
    unittest.main()

"""Regression guard: a TREE PLANTING EVENT whose photo failed to reach storage
must NOT be marked uploaded (and its blob must NOT be evicted).

Bug (thread 25181, filed 2026-09-10): `uploadTreeReport()` treated any 2xx as
success and `flushTreeReportQueue()` then called `markTreeReportUploaded()`,
which drops the record from `getPendingTreeReports()` (filter `!r.uploaded`).
Edgar reports the binary upload separately as `fileUploadedToGithub`; on a
burst of 24 photos (Edgar_20260910213111_376 .. _422) the GitHub upload
silently failed and returned 200 + `fileUploadedToGithub: false`, so the blobs
were evicted from IndexedDB while the ledger kept a phantom `Photo URL`.

These tests lock in: (1) the client inspects `fileUploadedToGithub`; (2) a
false value keeps the record queued; (3) the JS still parses.
"""

import json
import os
import re
import subprocess
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(REPO, "index.html")


def read_index():
    with open(INDEX, encoding="utf-8") as f:
        return f.read()


class TestPhotoUploadGuard(unittest.TestCase):
    def test_photo_landed_helper_exists_and_checks_field(self):
        html = read_index()
        self.assertIn("function photoLanded(data)", html)
        self.assertIn("data.fileUploadedToGithub === false", html)

    def test_flush_does_not_unconditionally_mark_uploaded(self):
        html = read_index()
        # The old shape marked uploaded immediately after every successful call.
        self.assertNotIn(
            "lastResult = await uploadTreeReport(record);\n          await markTreeReportUploaded(record.id);",
            html,
        )
        # The new shape gates the mark on photoLanded(...).
        self.assertIn("if (photoLanded(lastResult))", html)
        self.assertIn("await markTreeReportPhotoPending(record.id)", html)

    def test_photo_pending_flag_persisted(self):
        html = read_index()
        self.assertIn("async function markTreeReportPhotoPending(id)", html)
        self.assertIn("record.photoUploadPending = true", html)

    def test_photo_pending_is_surfaced_not_silent(self):
        html = read_index()
        self.assertIn("pendingPhotoPending", html)
        # present in both PT and EN dicts
        self.assertGreaterEqual(html.count("pendingPhotoPending:"), 2)

    def test_photo_landed_logic_via_node(self):
        """Evaluate the extracted helper against representative responses."""
        html = read_index()
        m = re.search(r"function photoLanded\(data\) \{.*?\n    \}", html, re.S)
        self.assertIsNotNone(m, "photoLanded not found")
        harness = (
            m.group(0)
            + "\nconst cases = "
            + json.dumps(
                [
                    [{"status": "success", "fileUploadedToGithub": False}, False],
                    [{"status": "success", "fileUploadedToGithub": True}, True],
                    [{"status": "success"}, True],
                    [{}, True],
                    [None, True],
                ]
            )
            + ";"
            + "\nlet ok = true;"
            + "\nfor (const [input, want] of cases) {"
            + "  const got = photoLanded(input);"
            + "  if (got !== want) { ok = false; console.error('FAIL', JSON.stringify(input), got, want); }"
            + "}"
            + "\nconsole.log(ok ? 'PHOTO_LANDED_OK' : 'PHOTO_LANDED_FAIL');"
        )
        with open("/tmp/_photo_landed_check.js", "w", encoding="utf-8") as f:
            f.write(harness)
        r = subprocess.run(
            ["node", "/tmp/_photo_landed_check.js"], capture_output=True, text=True
        )
        self.assertEqual(r.returncode, 0, r.stderr[:300])
        self.assertIn("PHOTO_LANDED_OK", r.stdout)

    def test_inline_scripts_parse(self):
        html = read_index()
        scripts = re.findall(r"<script>(.*?)</script>", html, re.S)
        self.assertGreaterEqual(len(scripts), 1)
        for i, s in enumerate(scripts):
            with open("/tmp/_guard_check.js", "w", encoding="utf-8") as f:
                f.write(s)
            r = subprocess.run(
                ["node", "--check", "/tmp/_guard_check.js"],
                capture_output=True,
                text=True,
            )
            self.assertEqual(r.returncode, 0, f"script {i}: {r.stderr[:300]}")


if __name__ == "__main__":
    unittest.main()

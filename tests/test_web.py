"""Tests for the viewer's data contract and the local analysis server.

The browser side is checked by asserting the shape of what Python produces:
``web/app.js`` reads specific keys, and a rename on the Python side would
otherwise only show up as a blank page.
"""

import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from export_for_web import analyse_text, verse_to_dict
from scripts.serve_web import Handler
from src.engine import assign_rhyme_labels
from src.phonetics import process_verse

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = PROJECT_ROOT / "web"

LYRICS = ("His palms are sweaty, knees weak, arms are heavy\n"
          "There is vomit on his sweater already, moms spaghetti\n"
          "He is nervous but on the surface he looks calm and ready")

# Keys web/app.js reads. Adding one here means updating the page too.
VERSE_KEYS = {"artist", "track", "engine", "text", "lines", "metrics", "groups",
              "audio", "timed"}
SYLLABLE_KEYS = {"text", "label", "nucleus", "coda", "onset", "start", "end"}
GROUP_KEYS = {"label", "syllables", "length", "occurrences", "similarity", "strength"}


class TestVerseSerialisation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        verse = process_verse(LYRICS, artist="Eminem")
        assign_rhyme_labels(verse, min_occurrences=2)
        cls.payload = verse_to_dict(verse, "Eminem", "Test", "exact")

    def test_top_level_keys(self):
        self.assertEqual(set(self.payload), VERSE_KEYS)

    def test_lines_are_lists_of_words(self):
        self.assertEqual(len(self.payload["lines"]), 3)
        self.assertTrue(all(isinstance(line, list) for line in self.payload["lines"]))

    def test_syllable_keys(self):
        syllable = self.payload["lines"][0][0]["syllables"][0]
        self.assertEqual(set(syllable), SYLLABLE_KEYS)

    def test_group_keys(self):
        for group in self.payload["groups"]:
            self.assertEqual(set(group), GROUP_KEYS)

    def test_groups_are_sorted_longest_then_strongest(self):
        keys = [(-g["length"], -g["strength"], g["label"]) for g in self.payload["groups"]]
        self.assertEqual(keys, sorted(keys))

    def test_text_round_trips_for_reanalysis(self):
        """The viewer re-posts this text to switch engines."""
        self.assertTrue(self.payload["text"].strip())
        self.assertEqual(len(self.payload["text"].split("\n")), 3)

    def test_payload_is_json_serialisable(self):
        json.dumps(self.payload)

    def test_every_label_appears_in_groups(self):
        labels = {syl["label"]
                  for line in self.payload["lines"]
                  for word in line
                  for syl in word["syllables"] if syl["label"]}
        self.assertEqual(labels, {g["label"] for g in self.payload["groups"]})


class TestAnalyseText(unittest.TestCase):
    def test_each_engine_produces_a_valid_payload(self):
        for engine in ("exact", "families", "similarity", "chains"):
            with self.subTest(engine=engine):
                payload = analyse_text(LYRICS, "You", "Pasted", engine=engine)
                self.assertEqual(set(payload), VERSE_KEYS)
                self.assertEqual(payload["engine"], engine)
                self.assertEqual(payload["text"], LYRICS)

    def test_chain_groups_carry_length_and_similarity(self):
        payload = analyse_text(LYRICS, "You", "Pasted", engine="chains")
        multi = [g for g in payload["groups"] if g["length"] > 1]
        for group in multi:
            self.assertIsNotNone(group["similarity"])
            self.assertGreaterEqual(group["occurrences"], 2)


class TestStaticFiles(unittest.TestCase):
    def test_page_references_its_assets(self):
        html = (WEB_DIR / "index.html").read_text(encoding="utf-8")
        for asset in ("style.css", "app.js", "data.js"):
            self.assertIn(asset, html)

    def test_required_element_ids_exist(self):
        html = (WEB_DIR / "index.html").read_text(encoding="utf-8")
        for element_id in ("trackSelect", "engineSelect", "lyrics", "groupList",
                           "stats", "tooltip", "pastePanel", "analyseBtn"):
            self.assertIn(f'id="{element_id}"', html)

    def test_hidden_attribute_is_not_overridden(self):
        """An id selector setting `display` beats [hidden]; the CSS must undo it."""
        css = (WEB_DIR / "style.css").read_text(encoding="utf-8")
        self.assertIn("#pastePanel[hidden]", css)


class QuietHandler(Handler):
    """Handler without the request logging, so test output stays readable."""

    def log_message(self, fmt, *args):
        pass


class TestServer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def post(self, payload, path="/api/analyze"):
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.port}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST")
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    def test_analyse_endpoint(self):
        status, payload = self.post({"lyrics": LYRICS, "engine": "similarity"})
        self.assertEqual(status, 200)
        self.assertEqual(set(payload), VERSE_KEYS)
        self.assertGreater(payload["metrics"]["syllables"], 0)

    def test_empty_lyrics_rejected(self):
        status, payload = self.post({"lyrics": "   "})
        self.assertEqual(status, 400)
        self.assertIn("error", payload)

    def test_unknown_engine_rejected(self):
        status, payload = self.post({"lyrics": LYRICS, "engine": "nope"})
        self.assertEqual(status, 400)
        self.assertIn("error", payload)

    def test_unknown_endpoint_is_404(self):
        status, _ = self.post({"lyrics": LYRICS}, path="/api/nope")
        self.assertEqual(status, 404)

    def test_oversized_body_rejected(self):
        status, payload = self.post({"lyrics": "la la la\n" * 40000})
        self.assertEqual(status, 413)
        self.assertIn("error", payload)

    def test_range_request_returns_partial_content(self):
        """Browsers refuse to seek in media served without byte ranges."""
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/style.css",
            headers={"Range": "bytes=10-19"})
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
            self.assertEqual(response.status, 206)
            self.assertEqual(len(body), 10)
            self.assertTrue(response.headers["Content-Range"].startswith("bytes 10-19/"))

    def test_suffix_range(self):
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/style.css", headers={"Range": "bytes=-5"})
        with urllib.request.urlopen(request, timeout=30) as response:
            self.assertEqual(response.status, 206)
            self.assertEqual(len(response.read()), 5)

    def test_open_ended_range(self):
        full = urllib.request.urlopen(f"http://127.0.0.1:{self.port}/style.css", timeout=30).read()
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/style.css", headers={"Range": "bytes=5-"})
        with urllib.request.urlopen(request, timeout=30) as response:
            self.assertEqual(response.read(), full[5:])

    def test_unsatisfiable_range(self):
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/style.css",
            headers={"Range": "bytes=99999999-99999999"})
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request, timeout=30)
        self.assertEqual(caught.exception.code, 416)

    def test_accept_ranges_is_advertised(self):
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/style.css", timeout=30) as response:
            self.assertEqual(response.headers["Accept-Ranges"], "bytes")

    def test_serves_the_page(self):
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/", timeout=30) as response:
            self.assertEqual(response.status, 200)
            self.assertIn(b"RhymeMapper", response.read())


if __name__ == "__main__":
    unittest.main()

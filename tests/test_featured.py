"""Songs featured on the published demo.

Every bundled verse is plain text with no timing, so the published site never
shows the player, the timeline or the clock - the whole transport is invisible
to anyone who has not installed the project. Resolving one real link at build
time fixes that.

It involves the network, so the rule is that a failure is a warning: YouTube
refusing a datacentre address, or a lyrics database being down, must not stop a
static site from publishing.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from rhymemap.sources import Song, SourceError
from rhymemap.sources.lrc import parse_lrc
from scripts.build_static import featured_links, resolve_featured

LRC = ("[00:00.50]palms are sweaty knees weak arms are heavy\n"
       "[00:03.20]vomit on his sweater already moms spaghetti\n"
       "[00:06.10]he is nervous but on the surface he looks calm and ready\n")


def a_song():
    lines = parse_lrc(LRC, duration=180.0)
    return Song(title="Lose Yourself", artist="Eminem",
                lyrics="\n".join(line.text for line in lines), lines=lines,
                duration=180.0, video_id="xFYQQPAOz7Y", source="youtube",
                url="https://www.youtube.com/watch?v=xFYQQPAOz7Y",
                provider="lrclib-synced")


class TestFeaturedLinks(unittest.TestCase):
    def read(self, text):
        with tempfile.TemporaryDirectory() as raw:
            path = Path(raw) / "demo_songs.txt"
            path.write_text(text, encoding="utf-8")
            return featured_links(path)

    def test_comments_and_blanks_are_ignored(self):
        self.assertEqual(
            self.read("# a note\n\nhttps://youtu.be/aaaaaaaaaaa\n\n# another\n"),
            ["https://youtu.be/aaaaaaaaaaa"])

    def test_several_links(self):
        self.assertEqual(len(self.read("https://youtu.be/aaaaaaaaaaa\nhttps://youtu.be/bbbbbbbbbbb\n")), 2)

    def test_a_missing_file_is_not_an_error(self):
        self.assertEqual(featured_links(Path("/nonexistent/demo_songs.txt")), [])

    def test_the_shipped_file_parses(self):
        self.assertIsInstance(featured_links(), list)


class TestResolveFeatured(unittest.TestCase):
    def run_with(self, links, side_effect):
        with patch("scripts.build_static.featured_links", return_value=links), \
             patch("rhymemap.sources.resolve", side_effect=side_effect):
            return resolve_featured("similarity", 2)

    def test_a_resolved_song_is_analysed_and_returned(self):
        songs = self.run_with(["https://youtu.be/xFYQQPAOz7Y"], lambda url: a_song())
        self.assertEqual(len(songs), 1)
        self.assertEqual(songs[0]["source"]["provider"], "lrclib-synced")
        self.assertEqual(songs[0]["source"]["sync"], "line")
        self.assertEqual(songs[0]["source"]["video_id"], "xFYQQPAOz7Y")

    def test_the_payload_can_drive_the_player(self):
        """A video id and line times are exactly what the transport needs."""
        songs = self.run_with(["https://youtu.be/xFYQQPAOz7Y"], lambda url: a_song())
        source = songs[0]["source"]
        self.assertTrue(source["video_id"])
        self.assertEqual(len(source["line_times"]), len(songs[0]["lines"]))
        self.assertGreater(source["duration"], 0)

    def test_an_unresolvable_link_is_skipped_not_fatal(self):
        def boom(url):
            raise SourceError("No lyrics found for that video.")
        self.assertEqual(self.run_with(["https://youtu.be/aaaaaaaaaaa"], boom), [])

    def test_an_unexpected_failure_is_also_survivable(self):
        """The network fails in ways no single exception type covers."""
        def boom(url):
            raise RuntimeError("connection reset by peer")
        self.assertEqual(self.run_with(["https://youtu.be/aaaaaaaaaaa"], boom), [])

    def test_one_failure_does_not_lose_the_others(self):
        calls = {"n": 0}

        def sometimes(url):
            calls["n"] += 1
            if calls["n"] == 1:
                raise SourceError("nope")
            return a_song()

        songs = self.run_with(["https://youtu.be/aaaaaaaaaaa", "https://youtu.be/bbbbbbbbbbb"], sometimes)
        self.assertEqual(len(songs), 1)

    def test_no_links_means_no_work(self):
        def explode(url):
            raise AssertionError("resolve must not be called with no links")
        self.assertEqual(self.run_with([], explode), [])


if __name__ == "__main__":
    unittest.main()

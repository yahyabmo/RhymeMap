"""Analyse any song from a link, in the terminal.

    python -m scripts.analyse_song "https://www.youtube.com/watch?v=..."
    python -m scripts.analyse_song --file lyrics.txt --artist "Nas"

Lyrics and word timings both come from the video's captions, so one fetch gives
the rhyme analysis and, in the viewer, the karaoke playback.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from src.cache import flush_all
from src.labeling import ENGINE_CHOICES, ENGINE_SIMILARITY, label_verse
from src.metrics import compute_metrics
from src.phonetics import process_verse
from src.sources import SourceError, from_text, load
from src.visual import VisualEngine


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("url", nargs="?", help="YouTube link (any form), or a video id")
    parser.add_argument("--file", "-f", type=Path, help="analyse a local lyrics file instead")
    parser.add_argument("--artist", "-a", default=None, help="override the artist name")
    parser.add_argument("--engine", "-e", default=ENGINE_SIMILARITY, choices=ENGINE_CHOICES)
    parser.add_argument("--min-occurrences", type=int, default=2)
    parser.add_argument("--legend", action="store_true", help="list the rhyme groups")
    parser.add_argument("--lyrics-only", action="store_true", help="print the fetched lyrics and stop")
    args = parser.parse_args(argv)

    if not args.url and not args.file:
        parser.error("give a link or --file")

    try:
        if args.file:
            if not args.file.exists():
                print(f"error: no such file: {args.file}", file=sys.stderr)
                return 1
            song = from_text(args.file.read_text(encoding="utf-8"),
                             title=args.file.stem, artist=args.artist or "Unknown")
        else:
            print(f"fetching {args.url} ...", file=sys.stderr)
            song = load(args.url)
    except SourceError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.artist:
        song.artist = args.artist

    print(f"\n{song.artist} - {song.title}")
    if song.source == "youtube":
        detail = f"{song.caption_kind} captions ({song.language})"
        print(f"  {song.line_count} lines, {len(song.timings)} timed words, {detail}")
    print()

    if args.lyrics_only:
        print(song.lyrics)
        return 0

    verse = process_verse(song.lyrics, artist=song.artist)
    label_verse(verse, engine=args.engine, min_occurrences=args.min_occurrences)

    VisualEngine().display(verse, legend=args.legend)
    metrics = compute_metrics(verse)
    print(f"density {metrics['density']}%   multi {metrics['multi']}%   "
          f"diversity {metrics['diversity']}%   groups {metrics['signatures']}   "
          f"syllables {metrics['syllables']}")
    flush_all()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

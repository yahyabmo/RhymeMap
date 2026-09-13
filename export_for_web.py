"""Export analysed verses to web/data.js for the browser viewer.

    python -m export_for_web [--input CSV] [--limit N]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from src.analyzer import DEFAULT_DATASET, DatasetError, iter_verses
from src.cache import flush_all
from src.engine import assign_rhyme_labels
from src.metrics import compute_metrics
from src.phonetics import process_verse

PROJECT_ROOT = Path(__file__).resolve().parent
WEB_DIR = PROJECT_ROOT / "web"


def verse_to_dict(verse, artist: str, track: str) -> dict:
    """Serialise a labelled verse, keeping the phonetic detail for tooltips."""
    lines = []
    for line in verse.lines:
        words = []
        for word in line.words:
            words.append({
                "full_text": word.text,
                "syllables": [
                    {
                        "text": syl.text,
                        "label": syl.rhyme_label,
                        "nucleus": syl.nucleus,
                        "coda": "".join(syl.coda),
                        "onset": "".join(syl.onset),
                    }
                    for syl in word.syllables
                ],
            })
        lines.append(words)
    return {"artist": artist, "track": track, "lines": lines, "metrics": compute_metrics(verse)}


def build(csv_path: str, limit: int | None, min_occurrences: int, tail_window) -> list[dict]:
    verses = []
    for track, artist, lyrics in iter_verses(csv_path):
        if limit is not None and len(verses) >= limit:
            break
        try:
            verse = process_verse(lyrics, artist=artist)
            assign_rhyme_labels(verse, min_occurrences=min_occurrences, tail_window=tail_window)
            verses.append(verse_to_dict(verse, artist, track))
        except Exception as exc:
            print(f"  !! {track}: {type(exc).__name__}: {exc}")
    return verses


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", "-i", default=DEFAULT_DATASET, help=f"lyrics CSV (default: {DEFAULT_DATASET})")
    parser.add_argument("--output", "-o", default=str(WEB_DIR / "data.js"), help="output JS file")
    parser.add_argument("--limit", "-n", type=int, default=None, help="export at most N verses (default: all)")
    parser.add_argument("--min-occurrences", type=int, default=2, help="minimum signature count to label")
    parser.add_argument("--tail-window", type=int, default=None, help="only label the last N syllables per line")
    args = parser.parse_args(argv)

    try:
        verses = build(args.input, args.limit, args.min_occurrences, args.tail_window)
    except DatasetError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if not verses:
        print(f"error: nothing to export from {args.input}", file=sys.stderr)
        return 1

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with open(output, "w", encoding="utf-8") as handle:
        handle.write("const rhymeData = ")
        json.dump(verses, handle, ensure_ascii=False, indent=2)
        handle.write(";\n")
    flush_all()

    size_kb = output.stat().st_size / 1024
    print(f"exported {len(verses)} verses to {output} ({size_kb:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

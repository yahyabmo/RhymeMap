"""Serve the viewer with a live analysis endpoint.

    python -m scripts.serve_web [--port 8000] [--no-browser]

The static page works on its own: `make web` pre-exports the bundled verses into
`web/data.js` and `web/index.html` opens straight from disk. This server adds one
thing the static page cannot do — analysing lyrics the user pastes in.

Why a server rather than porting the engine to JavaScript:

* CMUdict is several megabytes, and the syllabifier, the articulatory feature
  tables and the clustering would all have to be reimplemented in JS;
* two implementations of a phonetic engine drift, and then the browser and the
  terminal disagree about what rhymes, which is the one thing this project
  cannot afford.

Only the standard library is used, so there is nothing extra to install.
"""

from __future__ import annotations

import argparse
import json
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = PROJECT_ROOT / "web"

MAX_BODY_BYTES = 256 * 1024      # a very long verse is still only a few KB


class Handler(SimpleHTTPRequestHandler):
    """Static files from web/, plus POST /api/analyze."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def log_message(self, fmt, *args):
        if "/api/" in str(args):
            super().log_message(fmt, *args)

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.rstrip("/") != "/api/analyze":
            self._send_json({"error": "unknown endpoint"}, 404)
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._send_json({"error": "bad Content-Length"}, 400)
            return
        if length <= 0:
            self._send_json({"error": "empty request"}, 400)
            return
        if length > MAX_BODY_BYTES:
            self._send_json({"error": f"lyrics too long (limit {MAX_BODY_BYTES // 1024} KB)"}, 413)
            return

        try:
            request = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError) as exc:
            self._send_json({"error": f"invalid JSON: {exc}"}, 400)
            return

        lyrics = (request.get("lyrics") or "").strip()
        if not lyrics:
            self._send_json({"error": "no lyrics supplied"}, 400)
            return

        from src.labeling import ENGINE_CHOICES
        engine = request.get("engine") or "similarity"
        if engine not in ENGINE_CHOICES:
            self._send_json({"error": f"unknown engine {engine!r}"}, 400)
            return

        try:
            from export_for_web import analyse_text

            payload = analyse_text(
                lyrics,
                artist=str(request.get("artist") or "You"),
                track=str(request.get("track") or "Pasted lyrics"),
                engine=engine,
                min_occurrences=max(2, int(request.get("min_occurrences") or 2)),
            )
        except Exception as exc:
            self._send_json({"error": f"{type(exc).__name__}: {exc}"}, 500)
            return

        self._send_json(payload)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", "-p", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--no-browser", action="store_true", help="do not open a browser")
    args = parser.parse_args(argv)

    if not (WEB_DIR / "data.js").exists():
        print("note: web/data.js is missing; run `make web` to pre-export the bundled verses.")
        print("      The paste box will still work.")

    url = f"http://{args.host}:{args.port}/"
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"RhymeMapper viewer on {url}  (Ctrl-C to stop)")
    if not args.no_browser:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Turn a link into something the analyser can read.

The goal is to analyse *any* song, not just the twelve verses in the repository.
A YouTube URL is the most practical handle on a song: it identifies the track,
and it carries captions.

Captions are what make this work without a machine-learning pipeline. One fetch
yields the lyrics **and** word-level timings, so the rhyme analysis and the
karaoke playback come from the same source and no forced alignment is needed.

Audio is deliberately **not** downloaded. The viewer embeds YouTube's own player
and drives the highlight from its clock, which keeps playback on the platform
that is licensed to serve it, avoids shipping copyrighted audio, and costs no
bandwidth or disk. `src.timing` still handles a local file for anyone working
with audio they own.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from urllib.parse import parse_qs, urlparse

from .captions import cues_to_verse, parse_json3, parse_vtt_captions
from .timing import WordTiming

# youtu.be/ID, /watch?v=ID, /embed/ID, /shorts/ID, /live/ID
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_PATH_PREFIXES = ("/embed/", "/shorts/", "/live/", "/v/")

# Caption formats in order of preference: json3 carries per-word offsets.
_FORMAT_PREFERENCE = ("json3", "srv3", "vtt", "srv1")


class SourceError(Exception):
    """Raised with an actionable message when a song cannot be loaded."""


# yt-dlp reports every failure as one long DownloadError, and its advice
# ("report this issue on github") is wrong for most of them. Match the cause and
# say something the person reading it can act on.
_FAILURE_HINTS = (
    (("unable to connect to proxy", "tunnel connection failed", "connection refused",
      "temporary failure in name resolution", "network is unreachable",
      "failed to resolve", "timed out"),
     "Could not reach YouTube. Check your internet connection, or whether a proxy or "
     "firewall is blocking it."),
    (("private video", "video is private"),
     "That video is private, so its captions cannot be read. Try another upload."),
    (("video unavailable", "removed by the uploader", "no longer available",
      "account associated with this video has been terminated"),
     "That video is unavailable. Try another upload of the song."),
    (("sign in to confirm your age", "age-restricted", "age restricted", "inappropriate for some users"),
     "That video is age-restricted and cannot be read without signing in. Try another upload."),
    (("sign in to confirm", "not a bot", "confirm you're not a bot"),
     "YouTube is asking this machine to sign in before serving the video. Try again "
     "later, or paste the lyrics in directly."),
    (("available in your country", "blocked it in your country", "geo restricted",
      "not available from your location"),
     "That video is blocked in your region. Try another upload."),
    (("unsupported url", "is not a valid url"),
     "That link could not be read as a YouTube video."),
)


def explain_failure(message: str) -> str:
    """Turn a yt-dlp error into something worth showing a person."""
    lowered = message.lower()
    for needles, hint in _FAILURE_HINTS:
        if any(needle in lowered for needle in needles):
            return hint
    # Unrecognised: keep the first line, drop yt-dlp's issue-tracker boilerplate.
    first = message.split("\n")[0].strip()
    first = first.split("; please report this issue")[0].strip()
    return f"Could not read that video. {first}"


@dataclass
class Song:
    """A song ready to analyse."""

    title: str
    artist: str
    lyrics: str
    timings: list[WordTiming] = field(default_factory=list)
    duration: float = 0.0
    video_id: str = ""
    thumbnail: str = ""
    url: str = ""
    source: str = "text"
    caption_kind: str = ""     # "manual" or "automatic"
    language: str = ""

    @property
    def line_count(self) -> int:
        return len([line for line in self.lyrics.split("\n") if line.strip()])


def parse_youtube_id(url: str) -> str | None:
    """Extract the 11-character video id from any YouTube URL shape."""
    if not url:
        return None
    candidate = url.strip()

    if _ID_RE.match(candidate):
        return candidate

    if "://" not in candidate:
        candidate = "https://" + candidate

    try:
        parsed = urlparse(candidate)
    except ValueError:
        return None

    host = (parsed.hostname or "").lower().removeprefix("www.").removeprefix("m.")

    if host in {"youtu.be"}:
        video_id = parsed.path.lstrip("/").split("/")[0]
        return video_id if _ID_RE.match(video_id) else None

    if host not in {"youtube.com", "music.youtube.com", "youtube-nocookie.com"}:
        return None

    if parsed.path == "/watch":
        values = parse_qs(parsed.query).get("v") or []
        return values[0] if values and _ID_RE.match(values[0]) else None

    for prefix in _PATH_PREFIXES:
        if parsed.path.startswith(prefix):
            video_id = parsed.path[len(prefix):].split("/")[0]
            return video_id if _ID_RE.match(video_id) else None

    return None


def is_youtube_url(url: str) -> bool:
    return parse_youtube_id(url) is not None


def pick_caption_track(info: dict, languages=("en",)) -> tuple[dict | None, str, str]:
    """Choose the best caption track from a yt-dlp info dict.

    Manual subtitles beat automatic ones (they are the real lyrics rather than a
    transcription), and json3 beats everything else because it carries per-word
    timing. Returns (track, kind, language).
    """
    wanted = list(languages) + ["en"]

    for kind, key in (("manual", "subtitles"), ("automatic", "automatic_captions")):
        tracks = info.get(key) or {}
        if not tracks:
            continue

        # Exact language, then any regional variant (en-US, en-GB...), then anything.
        ordered: list[str] = []
        for language in wanted:
            if language in tracks:
                ordered.append(language)
        for language in tracks:
            if any(language.startswith(f"{w}-") for w in wanted) and language not in ordered:
                ordered.append(language)
        for language in tracks:
            if language not in ordered:
                ordered.append(language)

        for language in ordered:
            options = tracks[language] or []
            for preferred in _FORMAT_PREFERENCE:
                for option in options:
                    if option.get("ext") == preferred and option.get("url"):
                        return option, kind, language

    return None, "", ""


def parse_caption_payload(payload: str, ext: str):
    """Parse a downloaded caption track into cues."""
    if ext in {"json3", "srv3"}:
        try:
            return parse_json3(payload)
        except ValueError:
            pass
    return parse_vtt_captions(payload)


def _guess_artist(info: dict) -> str:
    """Prefer YouTube's music metadata, then the channel name."""
    for key in ("artist", "creator", "uploader", "channel"):
        value = info.get(key)
        if value:
            return str(value).removesuffix(" - Topic").strip()
    return "Unknown"


def _guess_title(info: dict) -> str:
    return str(info.get("track") or info.get("title") or "Untitled").strip()


def fetch_youtube(url: str, languages=("en",), dedupe: bool = True) -> Song:
    """Fetch a song's lyrics and word timings from YouTube captions.

    Network-bound, and the only part of this module that is. Everything it
    hands off to -- caption parsing, rolling-caption dedup, timing attachment --
    is pure and unit-tested.
    """
    video_id = parse_youtube_id(url)
    if not video_id:
        raise SourceError(
            f"That does not look like a YouTube link: {url!r}\n"
            "Try a form such as https://www.youtube.com/watch?v=VIDEOID"
        )

    try:
        import yt_dlp
    except ImportError as exc:
        raise SourceError(
            "yt-dlp is needed to read YouTube captions.\n    pip install yt-dlp"
        ) from exc

    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "extract_flat": False,
    }

    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            track, kind, language = pick_caption_track(info, languages)
            if track is None:
                raise SourceError(
                    f"{_guess_title(info)!r} has no captions, so there are no lyrics to read.\n"
                    "Try another upload of the song (official videos and lyric videos usually "
                    "have them), or paste the lyrics in directly."
                )
            payload = ydl.urlopen(track["url"]).read().decode("utf-8", errors="replace")
    except SourceError:
        raise
    except Exception as exc:
        raise SourceError(explain_failure(str(exc))) from exc

    cues = parse_caption_payload(payload, track.get("ext", ""))
    lyrics, timings = cues_to_verse(cues, dedupe=dedupe)

    if not lyrics.strip():
        raise SourceError(
            "The captions contained no usable lyrics -- they may be empty, or only "
            "sound effects such as [Music]."
        )

    return Song(
        title=_guess_title(info),
        artist=_guess_artist(info),
        lyrics=lyrics,
        timings=timings,
        duration=float(info.get("duration") or 0),
        video_id=video_id,
        thumbnail=str(info.get("thumbnail") or ""),
        url=f"https://www.youtube.com/watch?v={video_id}",
        source="youtube",
        caption_kind=kind,
        language=language,
    )


def from_text(lyrics: str, title: str = "Pasted lyrics", artist: str = "You") -> Song:
    """Wrap pasted lyrics as a Song."""
    if not lyrics.strip():
        raise SourceError("No lyrics supplied.")
    return Song(title=title, artist=artist, lyrics=lyrics.strip(), source="text")


def load(url_or_text: str, languages=("en",)) -> Song:
    """Load a song from a YouTube URL, or treat the input as raw lyrics."""
    if is_youtube_url(url_or_text):
        return fetch_youtube(url_or_text, languages)
    return from_text(url_or_text)

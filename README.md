# RhymeMapper

**RhymeMapper** analyses rhyme schemes in rap lyrics from phonetic data. It converts
words to phonemes, splits them into syllables, and groups syllables that rhyme —
colour-coding them in the terminal and in a browser viewer, and computing metrics
that can be compared across tracks and artists.

## Install

```bash
make install        # dependencies + the NLTK corpora g2p_en needs
```

## Use

```bash
make demo           # colour-code the demo verse in the terminal
make stats          # analyse a corpus -> data/stats.csv
make plots          # generate every figure into data/
make web            # export web/data.js and open the browser viewer
make serve          # the full interface: paste a YouTube link or your own lyrics
make test           # run the unit tests
make eval           # gold set, ablation table, artist-ID experiment
```

Every entry point is a real CLI:

```bash
python -m rhymemap.main --file my_lyrics.txt --artist "Nas" --legend
python -m scripts.generate_stats --input dataset/my_corpus.csv --output data/mine.csv
python -m analysis.run_all_plots --show
```

Point any target at another corpus with `make stats DATASET=path/to.csv`. The CSV
needs `track_name`, `artist`, and one of `artist_verses` / `raw_lyrics` / `lyrics`.
A larger corpus to try:
<https://www.kaggle.com/datasets/ceebloop/rap-lyrics-for-nlp>

## How it works

```
link or lyrics -> resolve (captions / LRCLIB) -> clean_word
               -> syllabify (CMUdict) -> Syllable(onset, nucleus, coda)
               -> articulatory feature distance -> cluster -> name from the rime
               -> coloured output / metrics / figures / synced playback
```

Phoneme and syllable lookups are cached in `.cache/`, so a repeated run of
`make stats` skips the phonetic work entirely (7.1s -> 0.34s on the bundled
corpus). Words outside CMUdict are recovered by spelling where possible —
g-dropping (`comin'` -> `coming`) and stripped apostrophes (`dont` -> `don't`) —
before falling back to the neural grapheme-to-phoneme model.

## Metrics

| Metric | Meaning |
|---|---|
| **Density** | % of syllables carrying a rhyme label |
| **Multi** | % of syllables inside a run of ≥2 consecutive syllables sharing one label |
| **Diversity** | distinct rhyme groups / total syllables |
| **Signatures** | number of distinct rhyme groups |
| **Syll.** | total syllable count |

## Analyse any song

Paste a YouTube link:

```bash
make serve                                  # then paste a link in the browser
python -m scripts.analyse_song "https://www.youtube.com/watch?v=..."
```

**Captions alone are not enough.** Captioning a music video is optional and most
labels skip it, so a captions-only tool fails on a large fraction of music — and
fails invisibly, since the same code and the same kind of link either work or
don't depending on something the uploader decided. Lyrics are resolved through
four sources in descending order of trust:

| | source | gives | written by |
|---|---|---|---|
| 1 | manual captions | lyrics + a time per **word** | a person |
| 2 | [LRCLIB](https://lrclib.net) synced | lyrics + a time per **line** | a person |
| 3 | automatic captions | lyrics + a time per **word** | a machine |
| 4 | LRCLIB plain | lyrics | a person |

LRCLIB sits above automatic captions deliberately. Machine transcription of
singing mishears rhyme endings specifically, and rhyme endings are the one thing
this project measures — so human lyrics with coarser timing beat a machine's
guess with finer timing. LRCLIB is free, needs no key, and is read with `urllib`;
it adds no dependency.

The page says which source it used and how finely it can sync, because that
changes how much the analysis can be trusted. If every source comes up empty the
error lists what each one answered, so a block can be told from an absence.

Three things captions get wrong, and what the parser does about them:

- **They scroll.** Automatic captions repeat the tail of the previous cue so the
  viewer keeps a rolling two-line window. Read literally that yields every lyric
  two or three times — and a duplicated line rhymes perfectly with itself, which
  would inflate density and chain counts. Cues are reduced to what they add.
- **Cue boundaries are not line breaks.** A cue may hold a line and a half. Since
  line-final rhyme is most of what this measures, merging two lines deletes the
  rhyme at the join, so lines are recovered from the pauses between words —
  with a threshold taken from the song's own median gap, so a double-time verse
  and a slow hook both work.
- **`[Music]`, `[Applause]`** and friends are filtered out.

Audio is never downloaded. The viewer embeds YouTube's own player and drives the
highlight from its clock, which keeps playback on the platform licensed to serve
it and costs no bandwidth or disk.

### If YouTube asks you to prove you are not a bot

It does that to addresses it does not recognise — always to datacentres,
sometimes to home connections. The fix is to let it see a signed-in session:

```bash
RHYMEMAP_COOKIES_FROM_BROWSER=chrome make serve   # or firefox, edge, brave
RHYMEMAP_COOKIES=/path/to/cookies.txt make serve  # or an exported cookie file
```

Nothing is read from your browser unless you set one of these. Even when
extraction is refused outright, the song's title is recovered from YouTube's
public oEmbed endpoint and the lyrics lookup still runs — so a block usually
costs you the word-level timing, not the analysis.

No link? Paste lyrics directly, or point the tool at a local file with
`--file lyrics.txt`.

## Online

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/yahyabmo/RhymeMap)

One click. It reads `render.yaml`, builds the `Dockerfile`, and gives you the
whole application at a URL — link box included. Free, no credit card. It sleeps
after 15 minutes idle and takes about 50 seconds to wake.

A read-only static build for GitHub Pages used to live here too. It has been
removed: it could display an analysis but never produce one, so it opened with a
link box that could not work and spent its hero explaining why.

Full instructions, including what to do when YouTube refuses a datacentre
address: [docs/DEPLOY.md](./docs/DEPLOY.md)

## The interface

`make serve` opens the full interface; `make web` produces a static page with the
bundled verses pre-analysed.

- **Hover any syllable** and every syllable in its rhyme group lights up across
  the verse. The tooltip shows the onset, nucleus and coda behind the match.
- **The sidebar lists rhyme groups longest-first.** Click one to isolate it —
  this is what makes a chain like `straight face lookin' boy` / `take place
  lookin' boy` / `they say lookin' boy` legible as a single structure.
- **Switching the engine re-analyses the song on screen**, so the v1 baseline and
  the current engine can be compared on the same lyrics.
- **Groups are named after how they sound** — `-ames`, `-ike`, `straight face
  lookin' boy` — not `A`, `B`, `AB`. The name comes from the group's own rime, so
  it means something, it can be said aloud, and it is the same in every song.
  Each row shows example words, the exact rime, and a map of where the group
  falls across the verse.
- **Rhyme colour is generated from the phonetics**, not picked from a palette.
  There is no upper bound on groups: *Rap God* produces 56 under the exact engine
  and 257 under chain detection.

### Playing it in time with the track

The Playback panel is a real transport: play/pause, a scrubbable timeline, the
clock, and **0.5× / 0.75× / 1×**. The speed control is the one that matters here
— a double-time verse is unreadable at full speed, and half speed makes the
internal rhymes audible one by one.

**Click any line to jump the track to it.** That is the pairing that makes the
analysis audible: see a rhyme, hear it. Clicking a *coloured syllable* still
isolates its rhyme group instead, so both gestures stay available. Space plays
and pauses.

The highlight follows whatever timing the source actually has — per word from a
caption track, per line from a synced lyric.

### Your own photo on the author card

Save a picture as `web/me.jpg` (`.png` and `.webp` also work). It is copied into
the published site automatically. Without one the card shows a lettered disc, so
nothing is ever broken — and the name and title are the two lines directly under
the image in `web/index.html`.

The design system is written down in [docs/DESIGN.md](./docs/DESIGN.md) — palette,
type scale, motion rules, component specs. Its one idea: **the analysis is the
album art.** Music players go achromatic so cover art can supply the colour;
RhymeMapper has no cover art, it has phonetics, so the chrome stays near-black
and every hue on screen is computed from the sound.

Effects (aurora, grain, split-text, count-up, click-spark, magnetic buttons,
spotlight panels, scrambled loading text) are ported to vanilla JS from the
patterns in [react-bits](https://github.com/DavidHDev/react-bits). All of them
switch off under `prefers-reduced-motion`, and the page stays fully usable.

## Playing it against the audio

Give the viewer word timings and it highlights each rhyme in time with the track.

```bash
# 1. produce word timings (any of these work)
python -m scripts.align_audio --audio track.mp3 --lyrics verse.txt -o timings.json
#    ...or export labels from Audacity, or write the JSON by hand:
#    [{"word": "palms", "start": 0.51, "end": 0.78}, ...]

# 2. put the audio in web/ and export with the timings
cp track.mp3 web/
make karaoke AUDIO=track.mp3 TIMINGS=timings.json
```

Forced alignment is deliberately **not** a dependency. Every aligner is heavy —
WhisperX pulls in torch, aeneas needs espeak and ffmpeg — so `scripts/align_audio.py`
uses whichever is installed and explains the options when neither is. Nothing in
`rhymemap/` imports them. WebVTT, SRT and Audacity label tracks are read directly, so
you can skip aligners entirely and label the words by hand.

Without timings the player is hidden and everything else behaves identically.

## Does it work?

`make eval` rebuilds the gold set, runs the full ablation, and regenerates
[`eval/RESULTS.md`](./eval/RESULTS.md) and [`eval/ARTIST_ID.md`](./eval/ARTIST_ID.md).

Scored against 13 hand-annotated verses (123 lines, 4 artists), grouping lines by
their final rhyme:

| Configuration | Pairwise F1 | B³ F1 |
|---|---|---|
| all lines separate (trivial) | 0.000 | 0.657 |
| all lines together (trivial) | 0.287 | 0.536 |
| `exact` — v1 baseline | 0.648 | 0.861 |
| `+consonant classes` | 0.654 | 0.849 |
| `+vowel space` | 0.727 | 0.899 |
| **`similarity` — full feature scoring** | **0.865** | **0.942** |
| `similarity` without the onset penalty | 0.832 | 0.934 |
| `chains` — multisyllabic spans | 0.454 | 0.786 |

Three things worth stating plainly:

- The similarity engine is a real improvement on the v1 baseline: **0.648 → 0.865**.
- **The chain engine scores worse than the baseline on this test.** It has the
  highest precision of any configuration and the lowest recall — it groups
  correctly but sparsely, because it looks for repeated contiguous spans while
  this gold set annotates line-final rhyme. It is the right tool for seeing a
  verse's structure and the wrong one for partitioning line endings, so
  `similarity` is the default.
- **Metrics alone do not identify the artist.** Every classifier tried lands at
  or below the 25% chance level, and no single metric separates the artists
  (ANOVA p = 0.29–0.96). With 3 verses per artist that is *no evidence*, not
  evidence of no effect — but it does mean the artist-similarity and dendrogram
  figures show clustering this corpus cannot support.

The annotations were made by Claude following a documented protocol, not by a
human expert. They are a consistent reference for comparing engines, not ground
truth; independent re-annotation is the most valuable next step.

## Rhyme matching

By default a syllable's signature is its vowel, its stress, and its exact coda,
so two syllables rhyme only if all three match. Passing
`use_consonant_families=True` replaces each coda consonant with its natural class
(NAS, PLO, SIB, FRI, LIQ, GLI, ASP), which makes slant rhymes such as
`loud` / `out` (both `AW` + plosive) group together.

## Figures

![artist averages](./data/artist_averages.png)
![density boxplot](./data/boxplot_density.png)
![all tracks](./data/scatter_all.png)
![Eminem track similarity](./data/similarity_Eminem.png)

## Requirements

Python 3.10+, plus the packages in `requirements.txt`.

## Layout

```
rhymemap/        core: models, phonetics, engine, metrics, visual, main
scripts/    CLI entry points (stats generation, NLTK bootstrap)
analysis/   figure generation
tests/      unit tests
dataset/    input corpora and the demo verse
data/       generated stats.csv and figures
web/        browser viewer
```

Developer notes: [DOC_DEV.md](./DOC_DEV.md) · Version history: [HISTORY.md](./HISTORY.md)

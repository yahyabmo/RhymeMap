# RhymeMapper

**See how a song rhymes.** Paste a YouTube link and RhymeMapper finds the
lyrics, breaks every word into syllables, and colours the ones that rhyme — then
plays the track back with the rhymes lighting up in time.

**▶ Live at [rhymemapper.onrender.com](https://rhymemapper.onrender.com)**
*(free hosting sleeps when idle; the first visit after a quiet spell takes about
50 seconds to wake)*

Built by **Yahya Bel Hajjam** and **Sohayb El Yaktini**.

---

## What it actually does

Rhyme is not string matching, and spelling is no guide at all. So every word
becomes phonemes, every phoneme sequence becomes syllables split into **onset /
nucleus / coda**, and syllables are compared on *articulatory distance* — how
the mouth actually moves.

Scores from the running engine, which groups a pair above **0.78**:

| pair | score | |
|---|---|---|
| `blue` / `shoe` | **1.00** | not one letter in common at the end |
| `through` / `blue` | **1.00** | nor here |
| `time` / `mine` | **0.96** | different codas, near-identical mouth shape |
| `cat` / `cat` | **0.65** | *does not group* — an identical onset is penalised |
| `cat` / `dog` | **0.54** | *does not group* |

The `cat` / `cat` row is the point. On its rime alone a word against itself is a
perfect 1.00; the onset penalty pulls it under the threshold, because repeating
a word is not rhyming with it.

```
link or lyrics ─▶ resolve ─▶ phonemes ─▶ syllables ─▶ feature distance
                                                    ─▶ cluster ─▶ name from the rime
```

Groups are named after how they **sound** — `-ames`, `-ike`, `straight face
lookin' boy` — not `A`, `B`, `AB`. The name is computed from the group's own
rime, so the same rhyme is called the same thing in every song, and the colour,
hashed from the name, is stable too.

---

## Quick start

```bash
git clone https://github.com/yahyabmo/RhymeMap
cd RhymeMap
make install     # dependencies + the NLTK corpora
make serve       # opens the interface
```

Then paste a YouTube link, or your own lyrics.

| | |
|---|---|
| `make serve` | the full interface |
| `make demo` | colour the demo verse in your terminal |
| `make test` | 456 unit tests |
| `make eval` | rebuild the gold set and the ablation table |
| `make stats` / `make plots` | corpus statistics and figures |

Python 3.10 or newer.

---

## Analysing any song

**Captions alone are not enough.** Captioning a music video is optional and most
labels skip it, so a captions-only tool fails on a large share of music — and
fails invisibly, since whether it works depends on something the uploader
decided. Lyrics are resolved through four sources in descending order of trust:

| | source | gives | written by |
|---|---|---|---|
| 1 | manual captions | lyrics + a time per **word** | a person |
| 2 | [LRCLIB](https://lrclib.net) synced | lyrics + a time per **line** | a person |
| 3 | automatic captions | lyrics + a time per **word** | a machine |
| 4 | LRCLIB plain | lyrics | a person |

LRCLIB sits above automatic captions deliberately. Machine transcription of
singing mishears rhyme endings specifically — and rhyme endings are the one
thing this project measures. Better text with coarser timing beats worse text
with finer timing.

The page says which source it used and how finely it can sync, because that
changes how much the analysis can be trusted. If everything comes up empty, the
error lists what each source answered, so a block reads differently from an
absence.

**Audio is never downloaded.** The viewer embeds YouTube's own player and drives
the highlight from its clock.

### If YouTube asks you to prove you are not a bot

It does that to addresses it does not recognise. Let it see a signed-in session:

```bash
RHYMEMAP_COOKIES_FROM_BROWSER=chrome make serve   # or firefox, edge, brave
RHYMEMAP_COOKIES=/path/to/cookies.txt make serve  # or an exported cookie file
```

Nothing is read from your browser unless you set one of these. Even when
extraction is refused outright, the title is recovered from YouTube's public
oEmbed endpoint and the lyrics lookup still runs — so a block usually costs the
word-level timing, not the analysis.

---

## The interface

- **Hover any syllable** and every syllable in its rhyme group lights up across
  the verse. The tooltip shows the onset, nucleus and coda behind the match.
- **Click a coloured syllable** to isolate its group; **click anywhere else on a
  line** to jump the track there. See a rhyme, hear it.
- **Playback** is a real transport: play/pause, a scrubbable timeline, the clock,
  and **0.5× / 0.75× / 1×**. Half speed is what makes a double-time verse
  legible.
- **Switching engine re-analyses the song on screen**, so the v1 baseline and
  the current engine can be compared on the same lyrics.
- **Progress is measured, not timed.** While a link resolves, the percentage
  moves when a step actually finishes; during the analysis it moves per line,
  which is where the time goes.
- **Colour is generated from the phonetics**, not picked from a palette, so
  there is no upper bound on groups. *Rap God* produces 123 under the exact
  engine and 257 under chain detection.

Effects — particle text, split-flap clock, border glow, tilted card, elastic
slider, aurora, grain — are ported to vanilla JS from the patterns in
[react-bits](https://github.com/DavidHDev/react-bits). No frameworks, no build
step. All of them switch off under `prefers-reduced-motion`.

The design system is written down in [docs/DESIGN.md](./docs/DESIGN.md). Its one
idea: **the analysis is the album art.** Music players go achromatic so cover art
can supply the colour; RhymeMapper has no cover art, it has phonetics, so the
chrome stays near-black and every hue on screen is computed from the sound.

---

## Four engines

| engine | groups syllables by |
|---|---|
| `chains` | repeated multisyllabic spans — **the default** |
| `similarity` | articulatory feature distance, then clustering |
| `families` | v1 signature + consonant classes |
| `exact` | v1 baseline: string equality on `{vowel}_{stress}_{coda}` |

---

## Does it work?

`make eval` rebuilds the gold set, runs the ablation and regenerates
[`eval/RESULTS.md`](./eval/RESULTS.md) and
[`eval/ARTIST_ID.md`](./eval/ARTIST_ID.md).

Scored against 13 hand-annotated verses (123 lines, 4 artists), grouping lines
by their final rhyme:

| Configuration | Pairwise F1 | B³ F1 |
|---|---|---|
| all lines separate *(trivial)* | 0.000 | 0.657 |
| all lines together *(trivial)* | 0.287 | 0.536 |
| `exact` — v1 baseline | 0.648 | 0.861 |
| `+ consonant classes` | 0.654 | 0.849 |
| `+ vowel space` | 0.727 | 0.899 |
| **`similarity` — full feature scoring** | **0.865** | **0.942** |
| `similarity` without the onset penalty | 0.832 | 0.934 |
| `chains` — multisyllabic spans | 0.454 | 0.786 |

Three things worth stating plainly:

- The similarity engine is a real improvement on the v1 baseline: **0.648 →
  0.865**.
- **The chain engine scores worse than the baseline on this test**, and it is
  still the default. It has the highest precision of any configuration and the
  lowest recall: it groups correctly but sparsely, because it looks for repeated
  contiguous spans while this gold set annotates line-final rhyme. It answers a
  different question — the one this project is *about* — and both engines are
  one click apart.
- **Metrics alone do not identify the artist.** Every classifier lands at or
  below the 25% chance level, and no single metric separates the artists
  (ANOVA p = 0.29–0.96). With 3 verses per artist that is *no evidence*, not
  evidence of no effect — but it does mean the artist-similarity and dendrogram
  figures show clustering this corpus cannot support.

The gold set was annotated by a model to a documented protocol, not by a human
expert, and not checked against a second annotator. It is a reproducible
reference, not ground truth: it compares engines against one consistent
standard, which is what an ablation needs, but the absolute values carry the
annotator's bias. Independent re-annotation is the single highest-value
improvement to this evaluation.

---

## Metrics

| Metric | Meaning |
|---|---|
| **Density** | % of syllables carrying a rhyme label |
| **Multi** | % of syllables inside a run of ≥2 consecutive syllables sharing one label |
| **Diversity** | distinct rhyme groups / total syllables |
| **Groups** | number of distinct rhyme groups |
| **Syllables** | total syllable count |

---

## Development

```
rhymemap/          the library — the only thing pip installs
  phonetics.py     cleaning, phoneme lookup, syllabification
  phonology.py     articulatory feature tables and distances
  similarity.py    syllable scoring and clustering
  chains.py        multisyllabic span detection
  naming.py        names a group after its own rime
  sources/         turning a link into lyrics
scripts/           the server, the CLI entry points — not distributed
analysis/          figures — not distributed
eval/              gold set, ablation, artist-ID experiment
web/               the viewer: three files, no build step
```

Every entry point is a real CLI:

```bash
python -m rhymemap.main --file my_lyrics.txt --artist "Nas" --legend
python -m scripts.analyse_song "https://www.youtube.com/watch?v=..."
python -m scripts.generate_stats --input dataset/my_corpus.csv
```

`make test-offline` runs the whole suite with every outbound connection blocked.
The song loader is network-bound by nature, so a test that quietly reached
YouTube or LRCLIB would be flaky in CI and would pass locally for whoever wrote
it. There is a check that none does.

More in [DOC_DEV.md](./DOC_DEV.md); the history of what changed and why is in
[HISTORY.md](./HISTORY.md).

---

## Deploying your own

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/yahyabmo/RhymeMap)

One click. It reads `render.yaml`, builds the `Dockerfile`, and gives you the
whole application at a URL. Free, no credit card, sleeps after 15 minutes idle.
Full notes, including what changes when YouTube refuses a datacentre address:
[docs/DEPLOY.md](./docs/DEPLOY.md).

---

## Licence

[MIT](./LICENSE).

Lyrics in `dataset/` are excerpts used for analysis and remain the property of
their authors. RhymeMapper never downloads or redistributes audio.

# RhymeMapper – Developer Documentation

1. [Overview](#overview)
2. [Structure](#structure)
3. [Data models](#models)
4. [Phonetics](#phonetics)
5. [Rhyme engine](#engine)
5b. [Similarity engine](#similarity)
6. [Metrics](#metrics)
7. [Visualisation](#visual)
8. [Batch analysis](#batch)
9. [Analysis & plotting](#analysis)
10. [Caching](#caching)
11. [Makefile](#makefile)
12. [Testing](#testing)
13. [Dependencies](#dependencies)

---

## 1. Overview <a name="overview"></a>

RhymeMapper converts lyrics into phonemes, splits them into syllables, extracts
each syllable's onset / nucleus / coda, groups syllables that rhyme, and reports
the result as coloured text, metrics, and figures.

---

## 2. Structure <a name="structure"></a>

```
src/
  models.py      dataclasses (Syllable, Nucleus, Word, Line, Verse)
  cache.py       two-tier persistent memoisation
  phonetics.py   cleaning, phoneme lookup, syllabification
  engine.py      signatures and label assignment
  metrics.py     the single definition of every metric
  visual.py      ANSI colour rendering
  analyzer.py    the corpus pipeline
  main.py        demo CLI
scripts/
  generate_stats.py    corpus -> data/stats.csv
  fetch_nltk_data.py   downloads the NLTK corpora g2p_en needs
analysis/
  config.py      paths, palette, headless backend selection
  data_loader.py stats loading and per-artist means
  plots.py       figure functions
  run_all_plots.py  generates every figure
tests/           unit tests
dataset/         input corpora + the demo verse
data/            generated stats.csv and figures
web/             browser viewer
```

---

## 3. Data models (`src/models.py`) <a name="models"></a>

### `Syllable`
- `text` – orthographic slice used for display. **Approximate**: the spelling is
  divided into equal spans rather than aligned to phonemes, so a boundary can sit
  a character or two off. Display only; it never affects matching.
- `nucleus` – vowel phoneme with stress, e.g. `"AA1"`.
- `coda` – consonants after the nucleus.
- `onset` – consonants before the nucleus. Kept because the similarity engine
  needs it: identical onset *and* identical rime is repetition, not rhyme.
- `is_terminal` – last syllable of the last word of a line.
- `rhyme_label` – assigned group, e.g. `"A"`, `"AB"`.
- `line_id`, `word_id`, `syl_index` – position, used to rebuild the syllable stream.

### `Nucleus`
A vowel with its stress and position. Predates `Syllable` and is retained as
public API; it is now **derived from the syllable split** rather than computed by
a second, independent phoneme pass.

### `Word`, `Line`, `Verse`
Containers. `Verse.syllables()` flattens the whole verse into one ordered list.

---

## 4. Phonetics (`src/phonetics.py`) <a name="phonetics"></a>

- `clean_word(text)` – strip punctuation, lowercase, trim.
- `lookup_variants(word)` – spellings to try against CMUdict before giving up:
  the word itself, then g-dropping (`comin` → `coming`), then clitic restoration
  (`dont` → `don't`, `hes` → `he's`). On the bundled corpus this resolves 21 of
  38 out-of-vocabulary words, and does so *more accurately* than the neural
  model, which returned `D AA1 N T` for `dont` and `TH AE1 T S` for `thats`.
- `phonemes_for_word(word)` – ARPAbet phonemes, reassembled from the syllable
  split for dictionary words and from `g2p_en` for the rest.
- `extract_syllables(...)` – the main entry point; returns `Syllable` objects with
  onset, nucleus, coda, position and `is_terminal` filled in.
- `heuristic_syllables(...)` – fallback for words CMUdict does not contain: start
  a new syllable at each vowel, attach following consonants as the coda.
- `process_line` / `process_verse` – assemble `Line` and `Verse` objects.

Both backends are constructed lazily. `G2p()` costs ~3.8s to build, and is only
needed for genuinely unknown words; building it at import time made every
command pay it, including `make test`.

---

## 5. Rhyme engine (`src/engine.py`) <a name="engine"></a>

### `label_for_index(i)`
Maps `0,1,2,…` to `A,B,…,Z,AA,AB,…`. The previous implementation indexed a
26-letter alphabet modulo its length, so the 27th group silently reused the first
group's label. A single dense verse exceeds 26 groups easily — *Rap God* produces
56 — so this corrupted real output rather than an edge case.

### `encode_coda(coda, use_consonant_families=False)`
Renders a coda as a signature fragment. With `use_consonant_families` each
consonant is replaced by its natural class from `CONSONANT_FAMILIES`
(NAS, PLO, SIB, FRI, LIQ, GLI, ASP), which is what lets `loud` and `out` — both
`AW` + plosive — group together.

> Earlier versions of this document stated that signatures used consonant
> families by default. They did not: `CONSONANT_FAMILIES` was defined and never
> referenced, and the signature used the raw coda. Family encoding is now
> implemented and available, but **off by default** so the exact-match behaviour
> stays reproducible as an evaluation baseline.

### `get_syllable_signature(syllable, use_consonant_families=False, include_stress=True)`
Returns `"{vowel}_{stress}_{coda}"`, or `""` for syllables that should be
ignored — currently unstressed syllables that are not line-final.

### `candidate_syllables(line, tail_window=None, only_terminal=False)`
Which syllables of a line may carry a label. `only_terminal` keeps just the
line-final syllable (classic end rhyme); `tail_window` keeps the last N.
`only_terminal` was previously accepted as a parameter and ignored.

### `assign_rhyme_labels(verse, ...)`
Two passes — count every signature, then label those reaching
`min_occurrences`. Returns the `RhymeRegistry` it used.

> `line.rhyme_label` exists on the model but is **not** written by this function,
> contrary to earlier documentation. Labels live on syllables.

---

## 5b. Similarity engine (`src/phonology.py`, `src/similarity.py`) <a name="similarity"></a>

The exact engine asks *"are these two signature strings equal?"*. Rhyme is not an
equality relation: "bit"/"beat" nearly rhyme, "bit"/"bought" do not, and exact
matching cannot express the difference. The similarity engine replaces the
string comparison with a score in [0, 1].

### `src/phonology.py` — the feature space

- **Vowels** are placed by height, backness, rounding, tenseness, the target of
  any offglide, and r-colouring. `vowel_distance` is their weighted distance.
- **Consonants** are described by place, manner and voicing; `manner_distance`
  encodes which manners sound alike (plosive/affricate are close, plosive/
  approximant are not).
- **Codas** are compared by `cluster_distance`: a Levenshtein alignment whose
  substitution cost is the feature distance between two consonants rather than
  0/1 on equality. This is what makes `-nt`/`-nd` near (0.10) and `-nt`/`-ks`
  far (0.48).

Both distances are rescaled by the largest distance attainable in their table.
Without that step the weighted averages never approached 1.0, the usable range
was compressed into roughly [0, 0.64], and unrelated pairs such as "cat"/"dog"
outscored genuine near-rhymes.

### `src/similarity.py` — scoring and grouping

```
score = (w_nucleus·nucleus_sim + w_coda·coda_sim + w_stress·stress_sim) / Σw
score ×= (1 − onset_identity_penalty)   if both onsets are non-empty and equal
```

The onset term is the part naive implementations miss: "cat"/"cat" and
`lookin'`/`lookin'` have a perfect rime, so a rime-only score rates them 1.0.
They are repetition, not rhyme. Two *empty* onsets are not penalised — sharing
"no onset" is not sharing an onset.

Observed ordering on the reference pairs:

| Pair | Score |
|---|---|
| cat / hat (perfect) | 1.00 |
| loud / out (slant) | 0.94 |
| bit / feet (near) | 0.87 |
| **cat / cat (repetition)** | **0.65** |
| cat / dog (unrelated) | 0.55 |
| cat / cool (unrelated) | 0.20 |

All weights live in `DEFAULT_WEIGHTS`, a single documented dict, so the
configuration is one object to defend and one object for `eval/` to sweep.

Grouping is agglomerative clustering with **average** linkage over the pairwise
distance matrix. Average linkage matters: with single linkage one loose pair
chains two unrelated rhyme families into a single group. The matrix is built
over *distinct* rhyme keys rather than syllable instances, since a dense verse
repeats sounds heavily.

### `src/labeling.py` — engine selection

Every CLI takes `--engine {exact, families, similarity}` and dispatches through
`label_verse`. `exact` is the v1 baseline, preserved so the evaluation in
`eval/` has something honest to compare against.

On the bundled corpus:

| Engine | Mean density | Mean multi | Mean groups |
|---|---|---|---|
| exact | 29.3% | 1.1% | 6.8 |
| families | 38.5% | 1.7% | 8.5 |
| similarity | 61.6% | 6.6% | 9.2 |

These numbers show the engines behave *differently*, not that one is *better* —
a higher density is equally consistent with over-grouping. Phase 4 settles that
against a hand-annotated gold set.

---

## 6. Metrics (`src/metrics.py`) <a name="metrics"></a>

| Metric | Definition |
|---|---|
| `density` | % of syllables carrying any rhyme label |
| `multi` | % of syllables inside a run of ≥2 consecutive syllables sharing **the same** label |
| `diversity` | distinct groups / total syllables |
| `signatures` | number of distinct groups |
| `syllables` | total syllable count |

> Two different formulas were previously both exported as "Multi":
> `generate_stats.py` computed signature *diversity*, while `analyzer.py` counted
> adjacent labelled syllables **without checking the labels matched**. They fed
> the same CSV column and the same plots. The names are now distinct and the
> adjacency check is real.

---

## 7. Visualisation (`src/visual.py`) <a name="visual"></a>

`VisualEngine.display(verse, legend=False)` prints the verse with each labelled
syllable on a coloured background, and optionally lists the groups by size.
Escape codes are suppressed when `NO_COLOR` is set or stdout is not a TTY.

---

## 8. Batch analysis <a name="batch"></a>

`src/analyzer.py` owns the corpus pipeline; `scripts/generate_stats.py` is a thin
CLI over it. Previously each file carried its own copy of the loop with divergent
metric definitions.

```bash
python -m scripts.generate_stats --input CSV --output CSV [--min-occurrences N]
                                 [--tail-window N] [--only-terminal] [--max-rows N]
```

The default input is `dataset/artists_sample.csv`. The previous default pointed
at `dataset/lyrics_raw.csv`, which is not in the repository, so the target failed
with a traceback; a missing or malformed dataset now produces an actionable
message.

---

## 9. Analysis & plotting (`analysis/`) <a name="analysis"></a>

`run_all_plots.py` generates: `scatter_all`, `artist_averages`,
`boxplot_density`, `artist_similarity`, `artist_dendrogram`, and a per-track
similarity heatmap for each featured artist present in the data.

> This module previously did not run at all: it had two `__main__` blocks, imports
> in the middle of the file, and referenced an undefined `df`, so `make plots`
> raised `NameError`. The artist-similarity and dendrogram figures were
> unreachable. It also called `plt.show()` unconditionally, which blocks on a
> headless machine; the backend is now selected accordingly and figures are
> closed after saving.

---

## 10. Caching (`src/cache.py`) <a name="caching"></a>

Phoneme and syllable lookups are memoised in memory and in `.cache/*.json`.
Bump `CACHE_VERSION` when the stored format or lookup semantics change. Disk I/O
is best-effort: a read-only checkout degrades to the memory tier.

Measured on `dataset/artists_sample.csv`: **7.1s cold → 0.34s warm**.

---

## 11. Makefile <a name="makefile"></a>

| Command | Action |
|---|---|
| `make install` | dependencies + NLTK corpora |
| `make test` | unit tests |
| `make demo` | colour-code the demo verse |
| `make stats` | corpus → `data/stats.csv` |
| `make plots` | all figures |
| `make web` | export `web/data.js` and open the viewer |
| `make clean` | remove caches and generated files |

`make web` opens the viewer through Python's `webbrowser` module; it previously
shelled out to `firefox`.

---

## 12. Testing <a name="testing"></a>

`./run_tests.sh` runs `unittest discover` with the project root as the top-level
import directory, so no test needs to patch `sys.path`.

- `test_models.py` – dataclass behaviour
- `test_phonetics.py` – cleaning, backoff, syllabification
- `test_engine.py` – signatures, label space, candidate selection, labelling
- `test_metrics.py` – metric definitions

Tests needing the neural fallback skip themselves when the corpora are absent.

---

## 13. Dependencies <a name="dependencies"></a>

See `requirements.txt`. Note that `g2p_en` depends on `distance`, which does not
build against setuptools 60+; the README and CI workflow both document the
workaround.

---

**Version:** 2.0.0

# RhymeMapper History

## v0.1 (2025-03-14) – MVP
- First working version.
- Rhyme detection based on the last nucleus (vowel) of each line.
- Automatic label assignment (A, B, C…) to lines.
- Basic terminal output with line labels.

## v0.2 (2025-03-20) – Syllable extraction
- Replaced nucleus‑only detection with full syllable analysis.
- Integration of `syllabify` for phonetic syllable splitting.
- Each syllable stores its text, nucleus (vowel + stress), and coda (following consonants).
- Heuristic fallback for unknown words (using `g2p_en` and vowel detection).

## v0.3 (2025-03-28) – Rhyme signatures & consonant families
- Created `get_syllable_signature()`: nucleus + stress + coda.
- Introduced `min_occurrences` threshold to filter rare signatures.
- Removed line labels (`[A]`, `[B]`) from the visual output.

> **Correction (v2.0).** This entry originally claimed that signatures mapped the
> coda to consonant families and that slant rhyme detection was enabled. Neither
> was true: `CONSONANT_FAMILIES` was defined but never referenced, and the
> signature used the raw coda plus the stress digit — which made matching
> *stricter* than plain exact matching, not looser. Family encoding was
> implemented in v2.0. The claim about colouring only terminal syllables by
> default was also wrong; `only_terminal` was ignored until v2.0.

## v0.4 (2025-04-15) – Batch analysis & metrics
- Created `scripts/generate_stats.py` to process a CSV of lyrics (`dataset/lyrics_raw.csv`).
- Computed metrics per morceau:
  - **Density** = % of syllables participating in a rhyme.
  - **Multi** = diversity of rhyme signatures (number of distinct signatures / total syllables × 100).
  - **Signatures** = number of distinct rhyme signatures.
  - **Syll.** = total number of syllables.
- Exported results to `data/stats.csv`.

## v1.0 (2025-04-27) – Final version for defense
- Added `analysis/` module with reusable plotting functions:
  - `config.py`: paths, colour palette.
  - `data_loader.py`: load stats, compute artist averages.
  - `plots.py`: scatter plots (all tracks & artist averages), boxplots, similarity heatmaps.
  - `run_all_plots.py`: generate all graphs automatically.
- Created `Makefile` to automate:
  - `make install` – install dependencies.
  - `make test` – run unit tests.
  - `make stats` – generate stats CSV.
  - `make plots` – produce all figures.
  - `make demo` – run the Eminem example.
  - `make clean` – remove generated files.
  - `make all` – full pipeline.
- Fully documented code (docstrings, comments).
- Restructured project directories (moved scripts into `analysis/` and `scripts/`).
- Updated `README.md`, `DOC_DEV.md`, and `HISTORY.md` for clarity.
- Ready for oral defense.

## v2.0 (2026-09-13) – Repaired foundation

Audit of the v1.0 codebase against its own documentation, and repair of what the
audit found.

### Correctness
- **Rhyme labels no longer collide.** `RhymeRegistry` indexed a 26-letter
  alphabet modulo its length, so the 27th rhyme group silently reused the first
  group's label. *Rap God* produces 56 groups; the shipped `web/data.js` used all
  26 letters, so the published demo was mislabelling. Labels now continue
  `A…Z, AA, AB, …` without bound.
- **`only_terminal` now works.** It was accepted as a parameter, ignored, and
  passed by `generate_stats.py` in the belief that it did something.
- **`CONSONANT_FAMILIES` is wired in** behind `use_consonant_families`, off by
  default so exact matching stays reproducible as an evaluation baseline.
- **The `multi` metric checks that adjacent labels match.** It previously counted
  any two adjacent *labelled* syllables as a multisyllabic rhyme.
- **One definition per metric.** `generate_stats.py` and `analyzer.py` each
  computed a different formula under the name "Multi" and fed the same column.
  `src/metrics.py` is now the single source; `diversity` is the separated name
  for the other formula.

### Things that did not run
- `analysis/run_all_plots.py` had two `__main__` blocks, mid-file imports and an
  undefined `df`; `make plots` raised `NameError`, and the artist-similarity and
  dendrogram figures were unreachable. Rewritten, headless-safe.
- `scripts/generate_stats.py` defaulted to `dataset/lyrics_raw.csv`, which is not
  in the repository; `make stats` raised `FileNotFoundError`. It now defaults to
  the bundled corpus and takes `--input`/`--output`.
- `make demo` shelled out to `firefox`. It now uses Python's `webbrowser`.
- `make install` never fetched the NLTK corpora `g2p_en` needs, so the first
  out-of-vocabulary word raised `LookupError`.

### Performance and accuracy
- Phoneme and syllable lookups are cached in memory and on disk: **7.1s → 0.34s**
  on the bundled corpus.
- `g2p_en` was called for every word to populate `Word.nuclei`, a field no
  consumer reads. Nuclei are now derived from the syllable split.
- `G2p()` (~3.8s to construct) is built lazily, so it is only paid when a word is
  genuinely unknown. Test-suite runtime went from 4.6s to 0.008s.
- Out-of-vocabulary words are recovered by spelling first — g-dropping
  (`comin` → `coming`) and clitic restoration (`dont` → `don't`) — which resolves
  21 of the bundled corpus's 38 unknown words *more accurately* than the neural
  model did (`dont` → `D AA1 N T`, `thats` → `TH AE1 T S`).

### Engineering
- `engine.py` had no test coverage; the suite went from 15 to 78 tests.
- Added `tests/__init__.py`, removed the `sys.path` patching from every test file.
- Added `pyproject.toml` and a GitHub Actions workflow (tests + ruff on 3.10–3.12).
- Syllables now carry their `onset` and their position in the verse.
- Code and docstrings standardised on English.
- `web/data.js`, `data/stats.csv` and `.cache/` are generated, and no longer tracked.

# RhymeMapper

**RhymeMapper** analyses rhyme schemes in rap lyrics from phonetic data. It converts
words to phonemes, splits them into syllables, and groups syllables that rhyme —
colour-coding them in the terminal and in a browser viewer, and computing metrics
that can be compared across tracks and artists.

## Install

```bash
make install        # dependencies + the NLTK corpora g2p_en needs
```

`g2p_en` depends on `distance`, which fails to build against setuptools 60+. If
`make install` trips on it:

```bash
pip install "setuptools<60" && pip install --no-build-isolation distance
pip install --upgrade setuptools && make install
```

## Use

```bash
make demo           # colour-code the demo verse in the terminal
make stats          # analyse a corpus -> data/stats.csv
make plots          # generate every figure into data/
make web            # export web/data.js and open the browser viewer
make test           # run the unit tests
```

Every entry point is a real CLI:

```bash
python -m src.main --file my_lyrics.txt --artist "Nas" --legend
python -m scripts.generate_stats --input dataset/my_corpus.csv --output data/mine.csv
python -m analysis.run_all_plots --show
```

Point any target at another corpus with `make stats DATASET=path/to.csv`. The CSV
needs `track_name`, `artist`, and one of `artist_verses` / `raw_lyrics` / `lyrics`.
A larger corpus to try:
<https://www.kaggle.com/datasets/ceebloop/rap-lyrics-for-nlp>

## How it works

```
lyrics -> clean_word -> syllabify (CMUdict) -> Syllable(onset, nucleus, coda)
       -> signature -> group by frequency -> labels A, B, ... Z, AA, AB, ...
       -> coloured output / metrics / figures
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
src/        core: models, phonetics, engine, metrics, visual, main
scripts/    CLI entry points (stats generation, NLTK bootstrap)
analysis/   figure generation
tests/      unit tests
dataset/    input corpora and the demo verse
data/       generated stats.csv and figures
web/        browser viewer
```

Developer notes: [DOC_DEV.md](./DOC_DEV.md) · Version history: [HISTORY.md](./HISTORY.md)

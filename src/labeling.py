"""One place to choose a rhyme engine.

``engine.assign_rhyme_labels`` and ``similarity.assign_similarity_labels`` take
the same verse and produce the same kind of output (labels on syllables), so
every CLI selects between them by name rather than importing one directly. The
evaluation harness uses the same registry to build its ablation rows.
"""

from __future__ import annotations

ENGINE_EXACT = "exact"
ENGINE_FAMILIES = "families"
ENGINE_SIMILARITY = "similarity"

ENGINE_CHOICES = (ENGINE_EXACT, ENGINE_FAMILIES, ENGINE_SIMILARITY)

ENGINE_HELP = {
    ENGINE_EXACT: "v1 baseline: group syllables whose vowel+stress+coda match exactly",
    ENGINE_FAMILIES: "exact matching, with coda consonants replaced by natural class",
    ENGINE_SIMILARITY: "cluster syllables on a continuous articulatory rhyme score",
}


def label_verse(verse, engine: str = ENGINE_SIMILARITY, **kwargs):
    """Label ``verse`` in place with the named engine; returns its registry.

    Unsupported keyword arguments are dropped rather than raising, so callers
    can pass one options bag to any engine.
    """
    if engine not in ENGINE_CHOICES:
        raise ValueError(f"unknown engine {engine!r}; choose from {', '.join(ENGINE_CHOICES)}")

    if engine == ENGINE_SIMILARITY:
        from .similarity import assign_similarity_labels

        allowed = {"weights", "threshold", "min_occurrences", "tail_window",
                   "only_terminal", "skip_unstressed_midline"}
        return assign_similarity_labels(verse, **{k: v for k, v in kwargs.items() if k in allowed})

    from .engine import assign_rhyme_labels

    allowed = {"min_occurrences", "tail_window", "only_terminal", "include_stress"}
    options = {k: v for k, v in kwargs.items() if k in allowed}
    options["use_consonant_families"] = engine == ENGINE_FAMILIES
    return assign_rhyme_labels(verse, **options)

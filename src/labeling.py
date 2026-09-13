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
ENGINE_CHAINS = "chains"

ENGINE_CHOICES = (ENGINE_EXACT, ENGINE_FAMILIES, ENGINE_SIMILARITY, ENGINE_CHAINS)

# `similarity` is the default because the ablation says so: on eval/gold.json it
# reaches pairwise F1 0.865 against 0.648 for the v1 exact engine, while `chains`
# reaches only 0.522. Chains are not worse in general -- they are solving a
# different problem (contiguous multisyllabic spans, not line-final grouping) and
# the gold set only annotates the latter. Use `chains` to see the structure of a
# verse; use `similarity` to group its rhymes.
ENGINE_HELP = {
    ENGINE_EXACT: "v1 baseline: group syllables whose vowel+stress+coda match exactly",
    ENGINE_FAMILIES: "exact matching, with coda consonants replaced by natural class",
    ENGINE_SIMILARITY: "cluster syllables on a continuous articulatory rhyme score (default)",
    ENGINE_CHAINS: "detect repeated multisyllabic spans (for visualising structure)",
}


def label_verse(verse, engine: str = ENGINE_SIMILARITY, **kwargs):
    """Label ``verse`` in place with the named engine; returns its registry.

    Unsupported keyword arguments are dropped rather than raising, so callers
    can pass one options bag to any engine.
    """
    if engine not in ENGINE_CHOICES:
        raise ValueError(f"unknown engine {engine!r}; choose from {', '.join(ENGINE_CHOICES)}")

    if engine == ENGINE_CHAINS:
        from .chains import assign_chain_labels

        allowed = {"weights", "threshold", "max_window", "min_occurrences", "max_line_gap"}
        assign_chain_labels(verse, **{k: v for k, v in kwargs.items() if k in allowed})
        # Chains own the labels directly; there is no signature registry.
        from .engine import RhymeRegistry

        return RhymeRegistry()

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

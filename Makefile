# RhymeMapper

.PHONY: help install test stats plots demo web web-export serve karaoke site eval gold tune clean all

PYTHON = python3
DATA_DIR = data
DATASET ?= dataset/artists_sample.csv

help:
	@echo "RhymeMapper:"
	@echo "  make install   Install dependencies and NLTK corpora"
	@echo "  make test      Run the unit tests"
	@echo "  make demo      Colour-code the demo verse in the terminal"
	@echo "  make stats     Analyse a corpus -> $(DATA_DIR)/stats.csv"
	@echo "  make plots     Generate all figures into $(DATA_DIR)/"
	@echo "  make web       Export web/data.js and open the viewer"
	@echo "  make serve     Serve the viewer with live analysis of your own lyrics"
	@echo "  make karaoke   Export with word timings (AUDIO=... TIMINGS=...)"
	@echo "  make site      Build the static read-only demo into site/"
	@echo "  make eval      Run the ablation and artist-ID experiments"
	@echo "  make gold      Rebuild eval/gold.json from the annotations"
	@echo "  make clean     Remove caches and generated files"
	@echo "  make all       stats, plots, then demo"
	@echo ""
	@echo "  Override the corpus with: make stats DATASET=path/to.csv"

install:
	pip install -r requirements.txt
	# g2p_en declares `distance`, which cannot build against setuptools 60+.
	# It never imports it; its real dependencies are in requirements.txt.
	pip install --no-deps g2p_en
	$(PYTHON) -m scripts.fetch_nltk_data

test:
	./run_tests.sh

stats:
	$(PYTHON) -m scripts.generate_stats --input $(DATASET)

plots:
	$(PYTHON) -m analysis.run_all_plots

demo:
	$(PYTHON) -m rhymemap.main --legend

web-export:
	$(PYTHON) -m rhymemap.webexport --input $(DATASET) --demo

web: web-export
	@echo "Opening web/index.html"
	@$(PYTHON) -c "import pathlib, webbrowser; webbrowser.open(pathlib.Path('web/index.html').resolve().as_uri())" || \
		echo "Could not open a browser. Open web/index.html manually."

gold:
	$(PYTHON) -m eval.build_gold

serve: web-export
	$(PYTHON) -m scripts.serve_web

# Karaoke playback: needs an audio file in web/ and a word-timing file.
#   make karaoke AUDIO=track.mp3 TIMINGS=timings.json
karaoke:
	@test -n "$(TIMINGS)" || (echo "usage: make karaoke AUDIO=track.mp3 TIMINGS=timings.json" && exit 1)
	$(PYTHON) -m rhymemap.webexport --input $(DATASET) --demo --timings $(TIMINGS) --audio $(AUDIO)
	$(PYTHON) -m scripts.serve_web

# The read-only demo that GitHub Pages serves. Songs are analysed now and baked
# in; the result needs no Python at runtime.
site:
	$(PYTHON) -m scripts.build_static --output site
	@echo "Preview it with: python3 -m http.server -d site 8000"

eval: gold
	$(PYTHON) -m eval.ablation
	@echo ""
	$(PYTHON) -m eval.artist_id

tune:
	$(PYTHON) -m eval.tune

clean:
	rm -rf .cache
	find . -name "__pycache__" -type d -prune -exec rm -rf {} +
	find . -name "*.pyc" -delete
	rm -f $(DATA_DIR)/stats.csv $(DATA_DIR)/*.png web/data.js
	rm -rf site

all: stats plots demo

# RhymeMapper

.PHONY: help install test stats plots demo web clean all

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
	@echo "  make clean     Remove caches and generated files"
	@echo "  make all       stats, plots, then demo"
	@echo ""
	@echo "  Override the corpus with: make stats DATASET=path/to.csv"

install:
	pip install -r requirements.txt
	$(PYTHON) -m scripts.fetch_nltk_data

test:
	./run_tests.sh

stats:
	$(PYTHON) -m scripts.generate_stats --input $(DATASET)

plots:
	$(PYTHON) -m analysis.run_all_plots

demo:
	$(PYTHON) -m src.main --legend

web:
	$(PYTHON) -m export_for_web --input $(DATASET)
	@echo "Opening web/index.html"
	@$(PYTHON) -c "import pathlib, webbrowser; webbrowser.open(pathlib.Path('web/index.html').resolve().as_uri())" || \
		echo "Could not open a browser. Open web/index.html manually."

clean:
	rm -rf .cache
	find . -name "__pycache__" -type d -prune -exec rm -rf {} +
	find . -name "*.pyc" -delete
	rm -f $(DATA_DIR)/stats.csv $(DATA_DIR)/*.png web/data.js

all: stats plots demo

# The full application: live analysis of pasted lyrics and YouTube links.
#
# Built for container hosts with a free tier (Hugging Face Spaces, Render,
# Fly.io, Railway). For the read-only demo, which needs no container at all,
# see scripts/build_static.py and .github/workflows/pages.yml.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NLTK_DATA=/app/nltk_data \
    RHYMEMAP_CACHE_DIR=/tmp/rhymemap-cache \
    HOST=0.0.0.0 \
    PORT=7860

WORKDIR /app

# Dependencies first, so the layer caches across code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    # g2p_en declares `distance`, which cannot build against setuptools 60+,
    # and never imports it.
    && pip install --no-cache-dir --no-deps g2p_en

COPY . .

# Bake the corpora and the phonetic caches into the image: the first request
# should not pay for a 4s model load or a corpus download.
RUN python -m scripts.fetch_nltk_data \
    && python -m export_for_web --demo \
    && cp -r /tmp/rhymemap-cache /app/.cache || true

ENV RHYMEMAP_CACHE_DIR=/app/.cache

EXPOSE 7860
CMD ["python", "-m", "scripts.serve_web", "--no-browser"]

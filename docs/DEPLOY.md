# Putting RhymeMapper online, for free

There are two versions of this, and they answer different questions.

| | Read-only demo | Full application |
|---|---|---|
| Analyses new songs | no | yes |
| Needs a server | no | yes |
| Free, permanently | **yes** | yes (Render, Koyeb) |
| Sleeps when idle | never | usually |
| Setup | one settings toggle | ~10 minutes |

**Start with the demo.** It is free forever, never sleeps, and is the right
thing to put in a portfolio or a defence. Add the full application afterwards
if you want strangers to be able to paste their own links.

---

## 1. Read-only demo — GitHub Pages

Songs are analysed at build time and baked into the page, so there is no Python
at runtime and nothing to keep running. Everything interactive still works:
hovering, tracing a rhyme group, isolating a chain, switching between songs and
engines. Only *analysing something new* is unavailable, and the page says so.

**Setup, once:**

1. Repository **Settings → Pages → Source: GitHub Actions**.
2. Push to `main`, or run the **Pages** workflow by hand from the Actions tab
   (it accepts `workflow_dispatch`, so you can publish from any branch).

The site appears at `https://<your-username>.github.io/RhymeMap/`.

Build it locally to check first:

```bash
make site
python3 -m http.server -d site 8000
```

To change which songs appear, edit `dataset/artists_sample.csv` and rebuild —
each row becomes a song in the picker.

---

## 2. Full application — a container host

The analysis engine is Python, so the live version needs somewhere to run it.
The included `Dockerfile` works on every host below.

> **Hugging Face Spaces no longer fits.** Docker and Gradio Spaces became
> PRO-only; only *Static* Spaces are still free, and a static Space is just
> another way to host the read-only demo that GitHub Pages already serves. An
> earlier version of this guide recommended it. It was right when written and is
> not any more — worth re-checking before you commit to any of the options below.

### Render — the one to try first

Free, **no credit card**, builds straight from the `Dockerfile`, and 750
instance-hours a month covers one container running continuously.

A `render.yaml` blueprint is included, so:

1. <https://dashboard.render.com> → **New → Blueprint**
2. Point it at this repository. It reads `render.yaml` and configures itself.

The catch: a free service **sleeps after 15 minutes idle**, and the next visitor
waits roughly 50 seconds for it to wake. Fine for a link in a report; awkward if
you are presenting live.

### Koyeb

Also free without a card, also Docker, and it scales to zero. Worth trying if
Render's cold start annoys you — the trade-offs differ slightly and both change
over time.

### Fly.io and Railway

Both work with this `Dockerfile`, and neither is free any more: Fly moved to a
paid model, Railway gives trial credit and then bills.

### Keeping the image small

The runtime stage installs `requirements-server.txt`, not `requirements.txt`.
pandas, matplotlib, seaborn and scikit-learn are about 157 MB and belong to the
corpus tooling, plotting and evaluation — none of which runs behind the web
server. Dropping them roughly halves the image, which is a shorter cold start on
a host that sleeps.

The builder stage still installs everything, because it bakes the NLTK corpora,
the pre-analysed songs and the phonetic caches into the image so the first
request does not pay for them.

## The thing to know before you deploy the full version

**YouTube blocks datacenter IP addresses.** Requests from a cloud host are much
more likely to be met with *"Sign in to confirm you're not a bot"* than requests
from a home connection. This is not something this project can fix — it affects
every tool built on `yt-dlp`, and it is why the error message for that case
names it specifically.

What this means in practice:

- **Locally it works.** `make serve` on your own machine is the reliable path.
- **Hosted, the link box may fail** while everything else keeps working. Pasting
  lyrics directly is unaffected, since that never touches YouTube.
- **It varies** by host, by IP, and over time. Worth trying; not worth promising
  to anyone.

If you are demonstrating this to a room, run it locally. Use the hosted version
for the link you leave behind.

---

## Cost

Everything above is free at the scale this project operates at. GitHub Pages has
a 1 GB site limit and a soft 100 GB/month bandwidth limit; the demo is under
500 KB. Hugging Face Spaces' CPU tier is free with no time limit.

---

## Which URL to put in a report

The GitHub Pages one. It loads instantly, never sleeps, cannot break, and shows
the analysis working on thirteen songs. Mention the local install for anyone who
wants to try their own.


---

## What has and has not been tested

The static build and its workflow are verified end to end: the site builds, is
served, and every interaction works in a browser.

The `Dockerfile` is **not** built anywhere in CI, and was written in an
environment with no container daemon, so `docker build` has never run against
it. What *was* verified is the part most likely to be wrong: the runtime layout.
The exact set of files the runtime stage copies was assembled into a directory,
`requirements-server.txt` installed into a clean virtualenv, and the server
started from it — `GET /` returned 200 and `POST /api/analyze` returned a valid
analysis under all three engines, with pandas confirmed absent.

If the build fails, it will be in the mechanics (a COPY path, the `useradd`
step), not in whether the application runs on those dependencies.

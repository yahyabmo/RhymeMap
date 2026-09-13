# Putting RhymeMapper online, for free

There are two versions of this, and they answer different questions.

| | Read-only demo | Full application |
|---|---|---|
| Analyses new songs | no | yes |
| Needs a server | no | yes |
| Free, permanently | **yes** | yes, with caveats |
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
A `Dockerfile` is included and works on every host below.

### Hugging Face Spaces — the best free option

No credit card, does not sleep aggressively, and 16 GB of RAM on the free CPU
tier, which is far more than this needs.

1. Create a Space at <https://huggingface.co/new-space>, SDK: **Docker**.
2. Push this repository to it:
   ```bash
   git remote add space https://huggingface.co/spaces/<user>/<space-name>
   git push space claude/awesome-mayer-apommx:main
   ```
3. It builds and serves on port 7860, which the `Dockerfile` already uses.

### Render

Free web service, 512 MB RAM. **Spins down after 15 minutes idle**, and the
next visitor waits ~50 seconds for it to wake.

New → Web Service → connect the repo → Docker → deploy. `PORT` is supplied
automatically and the server reads it.

### Fly.io / Railway

Both work with the same `Dockerfile`. Both now want a card on file even for
their free allowances, which is why they are listed third.

---

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

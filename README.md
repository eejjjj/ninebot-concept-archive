# Ninebot Concept Archive

Ninebot concept archive — intro wind wall and vehicle detail pages.

## Online preview (GitHub Pages)

After pushing to GitHub, enable **Settings → Pages → Deploy from branch `main` / root**, then visit:

`https://eejjjj.github.io/ninebot-concept-archive/`

Paths auto-detect the repo prefix (`/ninebot-concept-archive/`) on GitHub Pages; local preview uses `/`.

## Local preview

```bash
cd "/Users/wangyizhen/Desktop/202607_档案馆/ninebot-concept-archive"
bash preview.sh
# open http://localhost:8765/
```

Or without the script:

```bash
cd "/Users/wangyizhen/Desktop/202607_档案馆/ninebot-concept-archive"
python3 -m http.server 8765
```

## Project structure

```
ninebot-concept-archive/
├── index.html          → L1 · Index intro (正交正面风动片)
├── emax/               → L2 · EMAX book / pages / model
├── next/               → L2 · NEXT
├── info/               → Lab info & QR
├── emaxpages1/         → EMAX pages 0–80
├── emaxpages2/         → EMAX pages 81–160
├── assets/             → logo, book textures, 3D models
├── videos/             → EMAX intro
├── css/style.css
├── fonts/
├── js/
├── scripts/            → vendor setup (Three.js)
├── vendor/             → Three.js
└── preview.sh
```

## Routes

| Level | Page | URL |
|-------|------|-----|
| L1 · Index | Front-facing orthographic wind wall | `/` |
| L2 · EMAX | NINEBOT EMAX (CV-001) | `/emax/` **LOCKED book** · `/emax/pages/` reader · `/emax/model/` 3D |
| L2 · NEXT | NINEBOT NEXT (CV-002) | `/next/` |
| L2 · INFO | Lab info & QR | `/info/` |

### Navigation

- Logo on any page → `/` (back to Index wind wall)
- Header nav on detail pages: **EMAX** → `/emax/` · **NEXT** → `/next/` · **INFO** → `/info/`
- **`/emax/` book detail** — do not change unless explicitly requested (see `.cursor/rules/lock-001-detail.mdc`)

Do **not** open HTML directly (`file://`) — Three.js modules require HTTP.

## Push to GitHub

```bash
cd ninebot-concept-archive
git add .
git commit -m "Initial commit: ninebot concept archive"
git branch -M main
git remote add origin https://github.com/<your-username>/ninebot-concept-archive.git
git push -u origin main
```

Then: **GitHub repo → Settings → Pages → Source: main / (root)**.

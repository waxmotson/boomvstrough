# BOOM VS TROUGH — Static GitHub Pages site

This is the static version of the BOOM VS TROUGH dashboard.

## Files

```text
boom-vs-trough-static/
├── index.html
├── style.css
├── app.js
└── data.csv
```

There is **no Flask server and no Node.js server**.

The browser downloads `data.csv` and parses it using Papa Parse. Chart.js renders the graphs.

## GitHub Pages setup

1. Create a GitHub repository.
2. Upload all four files to the repository root.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose:
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/(root)**
5. Save.

GitHub will publish the site at the Pages URL it gives you.

## Updating the dataset

Replace only:

```text
data.csv
```

with your new CSV, keeping the same column headings.

The website automatically downloads the current CSV on every page load. The JavaScript also adds a cache-busting query parameter so a newly uploaded CSV is picked up rather than an old browser cache being used.

You do **not** need to rebuild the site when the data changes.

## Test locally

A browser normally blocks `fetch("data.csv")` when opening `index.html` directly as a `file://` URL.

Use a tiny local web server instead.

With Python:

```bash
python -m http.server 8000
```

Then open:

http://localhost:8000

Or with Node.js:

```bash
npx serve .
```

Then open the URL shown by `serve`.

## Updating columns

`app.js` is tolerant of the current spreadsheet's column names, including:

- `Unnamed: 0`
- `Unnamed: 1`
- `? CPI`
- `OCR`
- `? OCR`
- `MP`
- `? WPI`
- `UNEMP`
- `UNDEREMP`
- `PARTIC`
- `UNDERUTILISE`
- `FP ($B)`
- `FP STANCE`
- `?GDP(1/4)`

It also accepts cleaner versions such as `CPI`, `GDP change`, etc.

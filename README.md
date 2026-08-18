# BOOM VS TROUGH — Updated static site

This version is configured specifically for the current CSV structure.

## Files

- `index.html`
- `app.js`
- `style.css`
- `data.csv`

## Current CSV columns

The JavaScript expects:

```text
Time period
Month
CPI Change
OCR
OCR Change
MP
WPI Change
UNEMP
UNDEREMP
PARTIC
UNDERUTILISE
FP ($B)
FP STANCE
?GDP(1/4)
```

## Render

Use a **Static Site**.

Build command: leave blank.

Publish directory:

```text
.
```

No Node.js server or Flask server is required.

## Updating the dataset

Replace only `data.csv` with your next CSV, keeping the same column names.

The site fetches the CSV in the browser and includes a cache-busting query parameter, so new data is picked up after the page is refreshed.

## GitHub Pages

This project can also be deployed directly to GitHub Pages.

## Local testing

Because browsers restrict `fetch()` from `file://` pages, run a local HTTP server:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

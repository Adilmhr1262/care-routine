# CareRoutine

A private, offline-first tracker for recurring household and personal maintenance tasks: cleaning an AC filter, changing bedsheets, washing a water bottle, servicing a bicycle, replacing a toothbrush. Unlike an ordinary to-do list, CareRoutine tracks when a task was last completed and when it needs doing again.

No accounts, no servers, no internet needed. Everything is stored only in this browser (IndexedDB). There is no sample or demo data: a fresh install starts completely empty.

## Features

- **Dashboard** — Total Routines, Due Today, Overdue, and Completed This Month, plus tasks needing attention (overdue first, then nearest due), upcoming tasks, and recent completions.
- **My Routines** — Create, edit, pause, resume, and delete routines. Each routine has a name, category (Cleaning, Hygiene, Appliances, Vehicle, Home, Other), a repeat interval (every N days, weeks, or months), an optional first scheduled date and last-done date, and notes. Search, category/status filters, and sorting included.
- **Mark Done** — Record a completion with the local date and an optional note. Next due date is calculated automatically from the latest completion. Rapid clicks cannot create duplicate completions for the same day.
- **Activity History** — Real completion records, newest first, with month and routine filters. Edit or delete individual records; the routine's next due date is recalculated.
- **Settings** — Light, dark, and system themes. JSON backup export and validated restore (an invalid file leaves existing data untouched), CSV history export, and a Delete All Data action that requires typing DELETE.
- **Offline** — A service worker caches the app shell (versioned cache `careroutine-v1`), so the site works fully offline after the first visit.

## Date rules

- All scheduling uses local calendar dates (`YYYY-MM-DD`), never UTC timestamp comparisons.
- Monthly recurrence clamps to the shorter month: January 31 plus one month is February 28 (February 29 in a leap year).
- Next due date comes from the latest completion, or from the first scheduled date when nothing is completed yet, or from the creation date plus one interval.
- Statuses: Overdue, Due Today, Upcoming, Paused. Paused routines are excluded from due and overdue counts.

## Tech

HTML5 + CSS3 + vanilla JavaScript only. No frameworks, no CDN, no third-party libraries, no analytics, no external requests.

```
index.html          app shell and views
styles.css          theme, layout, responsive design
app.js              UI logic
db.js               IndexedDB layer (routines, completions, settings)
date-utils.js       local-date math, recurrence, validation, stats
backup.js           JSON backup validation, CSV export
sw.js               offline service worker
manifest.webmanifest
assets/icon-192.png, assets/icon-512.png
```

## Tests

- `tests/careroutine-unit.js` — Node unit checks for date math, validation, stats, backup validation, and CSV neutralisation.
- `tests/careroutine-test.js` — Headless Firefox browser suite covering the full order checklist.
- `tests/careroutine-offline.js` — Offline reload and offline data-entry checks.
- `tests/careroutine-live-check.js` — Live GitHub Pages smoke checks.

## Privacy

Your routines never leave this device. There is no tracking and no data collection of any kind.

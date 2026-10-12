# Wanlilushu · 万里路书

English | [简体中文](README.zh-CN.md)

A self-drive road trip planner for China: [wanlilushu.cn](https://wanlilushu.cn).

The application UI and travel data are in Chinese. Repository documentation is in English by default, with Chinese versions available.

The bundled national loop covers approximately 36,000 km, 30 provincial-level regions, 157 towns and scenic destinations, and 19 scenic roads. Choose a departure city, date, travel party, dog size, and pace to generate an itinerary, cost estimates, and preparation notes. Complete the loop in several months or follow the seasons over one or two years, with longer stays in places with comfortable weather.

## Features

- **Travel pace:** four presets, from sightseeing to extended stays. Customize nights at each stop, extra nights in comfortable locations, and the frequency of long stays. Optionally wait at a preceding long-stay location before entering a region with a seasonal travel window, such as Tibet, Xinjiang, western Sichuan, or the far northeast.
- **Route order:** follow the national loop or reorder its 17 segments to follow the seasons. Each segment can run in either direction, with connecting drives between segments split across multiple days when needed. Slower presets follow the seasons by default; the sightseeing preset follows the loop. Settings compare duration, distance, and seasonal fit.
- **Route editing:** skip a stop or segment, change its nights, add a place using AMap search and driving directions, and insert trips home. Annual Spring Festival breaks leave three days before Lunar New Year's Eve, using the Hong Kong Observatory's calendar tables, then resume the interrupted stay.
- **Map:** AMap standard and satellite maps, with layers for endpoints, stop types, travel direction, scenic roads, mountain passes, and day trips. Open each stop directly in AMap navigation.
- **Itinerary:** browse by stop or month. Stop details include history and culture, admission prices and reservations, local food, monthly climate, and nearby pet-friendly hotel, dining, and veterinary counts.
- **Long stays:** compare monthly climate comfort and pet-friendly facilities at 36 candidate locations.
- **Costs:** estimate meals using local restaurant price statistics or a user-supplied amount per meal. Enter accommodation prices and optionally adjust them using local price levels. Include fuel, charging, tolls, admission, dog care, and trips home. Set a total budget and compare ways to reduce spending.
- **Preparation:** reminders about border-area permits, seasonal roads, long drives, altitude, and dog regulations, plus a packing checklist.
- **Sharing and export:** encode a plan in a share link, or export Markdown notes and GPX tracks.

## Getting started

Use Node.js 22, as specified in [`.node-version`](.node-version). Copy [`.env.example`](.env.example) to `.env` and configure the required AMap credentials:

| Variables | AMap service platform | Purpose |
|---|---|---|
| `VITE_AMAP_JS_KEY`, `VITE_AMAP_JS_SECURITY_CODE` | Web (JS API) | Browser maps, place search, and driving directions. These values are included in the frontend bundle; configure an allowed-domain list in the AMap console. |
| `AMAP_WEB_KEY`, `AMAP_WEB_SECRET` | Web Service | Data scripts under `scripts/` only. These values must never enter the frontend bundle. |

Without keys, the application works except for the map and adding places.

```bash
npm ci
npm run dev        # http://localhost:5180
npm test           # unit tests
npm run build      # type checking and production output in dist/
```

The [GitHub Actions workflow](.github/workflows/ci.yml) is configured to check unit tests, TypeScript types, and production builds on pull requests and pushes to `main`. It requires no AMap or deployment credentials.

### Optional browser checks

[`scripts/check_share_browser.py`](scripts/check_share_browser.py) checks sharing and local storage in an isolated browser context. It accesses only the local development server and does not validate the live AMap service.

It requires Python 3.9 or newer, [Playwright](https://playwright.dev/python/docs/browsers), and the matching Chromium version. The following commands are for macOS/Linux; Python 3.11 was used for the local verification. Create an isolated environment and install the declared test dependency:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r scripts/requirements-browser.txt
.venv/bin/python -m playwright install chromium
npm run dev -- --host 127.0.0.1
```

Keep the server running and run the checks from another terminal:

```bash
.venv/bin/python scripts/check_share_browser.py
```

On Windows, replace `.venv/bin/python` with `.venv\Scripts\python.exe`. Linux may also require browser system dependencies; see the Playwright documentation. Unit tests and frontend builds do not require Python or the browser test dependency.

## Deployment

The build produces static files. The site is hosted on Cloudflare Pages:

```bash
npx wrangler login      # initial authentication
npm run deploy:cf       # tests, build using local .env, and upload to the wanlilushu Pages project
```

[`public/_headers`](public/_headers) configures static asset caching. The AMap Web key's allowed-domain list must include the site domain. Repository automation must obtain the maintainer's approval before pushing or deploying.

## Data

### Files

| Location | Contents | Maintenance |
|---|---|---|
| `data/route.json` | Segments, overnight stops, nights, recommended months, food, history, and dog notes | Manually edited |
| `data/roads.json` | Scenic roads | Manually edited |
| `data/research/` | Researched admission prices, reservations, pet policies, fuel prices, tolls, and border policies, with sources, confidence, and verification dates | Edited after manual or Claude Code-assisted research |
| `data/generated/` | Driving distances and geometry, elevation, departure-city connections, climate, restaurant price statistics, pet-friendly facility statistics, and image credits | Generated by scripts |
| `src/data/` | Combined application data | Generated by `npm run data`; do not edit directly |

### Data pipeline

```bash
python3 scripts/fetch_legs.py           # distances, driving times, and highway distances; cached OSRM requests
python3 scripts/fetch_transfers.py      # connecting drives between segment endpoints; roughly 550 routes
python3 scripts/fetch_full_geom.py      # full-resolution geometry in public/route/, grouped by segment
python3 scripts/fetch_elevation.py      # elevations and route high points; OpenTopoData SRTM 90m
python3 scripts/fetch_starts.py         # connections from departure cities to the nearest loop stop
python3 scripts/fetch_climate.py        # monthly climate; Open-Meteo
python3 scripts/fetch_prices.py         # restaurant price distributions; AMap Web Service
python3 scripts/fetch_pet_friendly.py   # pet-friendly hotel, dining, and veterinary counts; AMap Web Service
python3 scripts/fetch_images.py         # images and attribution; openly licensed Wikimedia Commons files
python3 scripts/fetch_hero.py           # larger hero images from the same Commons collection
python3 scripts/make_og.py              # social sharing image in public/og.png
python3 scripts/build_fonts.py         # subset the serif font; rerun after adding UI or data characters
npm run data                          # combine inputs into src/data/
```

### Updating data

Admission prices, opening hours, pet policies, fuel prices, and border policies change over time. Follow the [data maintenance guide](docs/data-maintenance.md).

- `npm run data:check` lists entries due for review, entries not verified for more than 90 days, missing prices, low-confidence sources, unknown pet policies, and unverified policies.
- [`.github/workflows/data-check.yml`](.github/workflows/data-check.yml) runs this audit on the first day of each month and writes its report to an issue labeled `data-refresh`.
- Each attraction has a “告诉我们” link for reporting changes to prices or rules.

### Sources and confidence

| Data | Source | Interpretation |
|---|---|---|
| Route distances, driving times, and geometry | OSRM and the OpenStreetMap road network | Calculated values; times exclude stops and rest breaks |
| Connecting drives between segments | OSRM and OpenStreetMap | Calculated values where routes are available. Missing routes and connections from or to home use straight-line distance × 1.25. |
| Highway distances | OSRM road references | Estimates |
| Elevation and mountain passes | OpenTopoData SRTM 90m, sampled every 12 km | Calculated values; sampled pass elevations can be slightly below the actual high point |
| Monthly climate | Open-Meteo historical weather; 2016–2025 for 47 locations, 2022–2025 for the others | Calculated values |
| Restaurant prices and pet-friendly facility counts | AMap Web Service search; only aggregate statistics are stored | Comparisons between locations |
| Admission prices, reservations, and pet policies | Attraction announcements, government sites, online travel agencies (OTAs), and news | Each entry has a source link and an official / OTA or news / unverified label. Unverified admission prices are excluded from totals. |
| Fuel, charging, and toll rates | Provincial price announcements and public reports | Editable defaults |
| Recommended months, accommodation modes, and charging availability by segment | Planning experience | Explicitly labeled as estimates in the UI |
| Map | AMap JS API 2.0 | The basemap carries its own map approval number |

China maps are displayed only through AMap. The repository's record dated 2026-10-03 notes a free quota of 1.5 million map loads per month for individually verified, noncommercial developers and a technical service license requirement for commercial use. Check the [AMap quota information](https://lbs.amap.com/upgrade) for current terms.

## Status and limitations

The features listed above are implemented, along with planning unit tests, data freshness checks, and monthly audit reports.

- Some admission prices and most pet policies remain unverified and are labeled accordingly.
- On the loop, skipping a segment removes stays but still drives through it. In seasonal order, the segment is omitted.
- OSRM transfers do not include live closure data. The planner flags connecting drives that pass known seasonal roads outside their usual open months; actual access still needs confirmation before departure.
- Segment order is generated automatically; manual drag-and-drop ordering is not available.
- There are no accounts or cloud storage. Plans are stored in the browser and can be transferred using share links.
- Offline use is not supported.
- Hosting is outside mainland China, where access speed may vary. Mainland hosting would require ICP filing.

## License

Code, documentation, and data compiled by this project (`data/route.json`, `data/roads.json`, and `data/research/`) are released under the [MIT License](LICENSE). Third-party material retains its own licenses:

| Material | Location | Source and license |
|---|---|---|
| Stop photographs and hero images | `public/img/`, `public/hero/` | Wikimedia Commons; individual licenses (CC BY, CC BY-SA, public domain, etc.) and authors are listed in `data/generated/images.json` and the application's sources section |
| Driving distances and geometry | `data/generated/legs.json`, `data/generated/transfers.json`, `public/route/` | Calculated by OSRM from OpenStreetMap; © OpenStreetMap contributors, ODbL |
| Elevation | `data/generated/elevation.json` | OpenTopoData, SRTM 90m |
| Monthly climate | `data/generated/climate.json` | Open-Meteo, CC BY 4.0 |
| Serif font subsets | `public/fonts/` | Noto Serif CJK SC (Source Han Serif), SIL Open Font License 1.1; see `public/fonts/OFL.txt` |
| Restaurant prices and pet-friendly facility statistics | `data/generated/prices.json`, `data/generated/pet_friendly.json` | Aggregated from AMap Web Service search, subject to its service terms |

## Maintainer documentation

- [Repository conventions](CLAUDE.md)
- [Data maintenance](docs/data-maintenance.md)
- [Share links and local storage validation](docs/share-and-storage-validation.md)

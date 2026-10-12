# Wanlilushu · Repository conventions

English | [简体中文](CLAUDE.zh-CN.md)

This is a frontend-only Vite + React 19 + TypeScript application, with no backend. Use only AMap JS API 2.0 for maps (`src/components/AmapView.tsx`, loaded by `amapLoader.ts`). Show a text message when no key is configured. Do not draw a custom map of China; the administrative boundary data has no map approval number. UI text is Chinese; code identifiers and comments are English.

Public documentation is in English by default, with Chinese versions linked in both directions. Keep facts, commands, and limitations synchronized when editing either version. The application remains Chinese by default.

## Commands

```bash
npm run dev          # http://localhost:5180
npm test             # Vitest; planning logic is in src/lib; logic changes require regression tests
npm run typecheck
npm run build
npm run data         # data/ -> src/data/; run after changing route.json or data/research/
npm run data:check   # audit due, stale, missing-price, and low-confidence data
npm run fonts        # subset Source Han Serif; rerun after adding UI or data characters
```

`fonts.test.ts` fails when the font subset does not cover newly added characters.

## Credentials and coordinates

- Never commit `.env`; it is ignored by `.gitignore`. Only `VITE_` variables enter the browser bundle, and these may contain only the AMap JS API key and security code.
- AMap Web Service credentials (`AMAP_WEB_KEY`, `AMAP_WEB_SECRET`) are read only in `scripts/`. Never prefix them with `VITE_` or place them in `src/`.
- Data coordinates are WGS84. Convert them with `wgsToGcj` from `src/lib/coords.ts` before passing them to AMap.

## Data rules

- `src/data/` is generated. Edit `data/route.json` or `data/research/*.json`, then run `npm run data`; do not edit generated files directly.
- Prices, policies, and opening hours must come from `data/research/`, with `src` links and `confidence` for each entry. Keep unknown values as `null`; do not supply estimated prices.
- Planning estimates, including food prices, recommended months, and `CHARGE_AVAIL`, must be labeled as estimates in the UI.
- Use OSRM-calculated driving distances from `scripts/fetch_legs.py`, not manually supplied distances. Limit public OSRM requests to one per second; the script caches results in `data/generated/.osrm_cache.json`.
- Use only openly licensed Wikimedia Commons images. Record attribution in `data/generated/images.json` and mark images that do not depict the stop itself as `generic`.

## Structure

- `src/lib/plan.ts`: `buildPlan(data, input)` rotates the loop, applies travel pace, schedules dates, estimates costs, and produces reminders. `bestStartDates` scans a year for departure dates with the best seasonal fit.
- `src/lib/costs.ts`: energy, accommodation, admission, and dog-care cost rules.
- `src/lib/profile.ts`: rearranges clockwise elevation samples into the plan's travel order.
- `src/lib/audit.ts`: data freshness checks, used by `scripts/check-data.ts` and the monthly workflow.
- `src/lib/order.ts`: `routeMode` chooses loop or seasonal order (`auto` uses the loop for the sightseeing preset). `seasonOrder` uses simulated annealing to choose the order and direction of 17 segments, scoring in-season regular nights against transfer distance / 150 and travel outside seasonal region windows. It uses a fixed seed and caches results. `routeFromOrder` joins segments with loop legs when adjacent, otherwise using OSRM `data.transfers` or straight-line estimates.
- `src/lib/stay.ts`: `keepNode` and `nightsFor`, re-exported by `plan.ts`.
- Spring Festival trips home: `SPRING_FESTIVAL` in `dates.ts` uses the Hong Kong Observatory's date tables. Do not replace it with `Intl` lunar-calendar calculations, which differ by a day in 2027 and 2030.
- `src/lib/custom.ts`: inserts `input.custom` stops into the loop. `legs.ts` records original leg references.
- `src/lib/share.ts`: stores differences from defaults in `?plan=` using deflate and base64url. `gpx.ts` and `markdown.ts` provide exports.
- `src/lib/budget.ts`: total budget and cost-reduction options.
- `src/lib/fixture.ts`: four-stop test loop.
- UI: `App.tsx` opens on the welcome screen, followed by five tabs: route, itinerary, long stays, costs, and preparation. Stop details, added places, and trip settings open in a `Drawer`. Inputs are stored under `wanlilushu.input.v2` in local storage. Provide defaults for older saved data when extending `PlanInput`.
- AMap Web Service results are stored only as statistics, such as counts and price quantiles, not individual point-of-interest names. Use AMap search links when the UI needs to show specific businesses.

## Deployment

`npm run deploy:cf` deploys to the Cloudflare Pages project `wanlilushu` at `wanlilushu.cn`. Ask before pushing or deploying.

For data updates, follow [Data maintenance](docs/data-maintenance.md) and use the project's `refresh-data` skill for research.

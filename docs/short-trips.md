# Custom short trips

[简体中文](短途自驾.md)

## Scope and decision

Provide an independent short-trip planner with selected origin, destination and ordered waypoints, departure date, total days, one-way/return travel, driving policy and daily driving limit. Preserve the nationwide planner, its exports and its `wanlilushu.input.v2` storage. Free-text requirements are notes; they are not automatically interpreted as constraints. Automatic attraction/hotel recommendations and verified local prices are outside this implementation.

The nationwide planner consumes a closed, researched dataset (`src/lib/plan.ts`, `src/lib/order.ts`). `src/components/AddPlace.tsx` searches places and calculates two replacement legs inside that loop. Reusing the loop would add unrelated nationwide stops. An independent planner can use the existing AMap loader and coordinate helpers without changing the nationwide scheduling rules.

| Approach | Benefit | Cost |
|---|---|---|
| Modify the nationwide planner | Reuse existing stop details | Arbitrary places lack the researched metadata required by the loop; existing callers and saved plans would need migration |
| Independent short-trip planner (selected) | Arbitrary endpoints and bounded daily scheduling; old plans remain compatible | Separate itinerary view and storage validation |

The welcome screen and nationwide toolbar open the short-trip planner. Only that planner calls the new place-search/driving adapter. Existing `AddPlace` and map loading behavior remain unchanged. Each selected place and route geometry uses WGS84 internally and GCJ-02 at the AMap boundary. Search results are transient; only places explicitly selected by the user are saved as trip settings, like existing custom stops. No business directory is retained.

## Remote calls and persistence

AMap JS API 2.0 provides [place search and driving routes](https://a.amap.com/jsapi/static/doc/index.html). Driving policy uses its documented `LEAST_TIME`, `LEAST_FEE` and `LEAST_DISTANCE` constants. Distances and durations come from the returned road route; return travel is queried in its actual direction. A missing key, failed query, invalid result or timeout produces an error, never a straight-line replacement.

The SDK owns connections, pools and transport retries and exposes no per-request connection/read/pool timeout controls in the documented JS API. Application deadlines bound waiting, not necessarily the SDK's background network activity: each search has a 15-second UI deadline and the complete generation (loader plus sequential leg queries) a 60-second UI deadline. These are application responsiveness limits, not claims about network latency. There is no application retry. At most five waypoints means at most seven direction queries including a direct return; no partial plan is published. Late callbacks cannot replace newer state. The shared loader and its configuration are not modified.

Short-trip settings use `wanlilushu.short.v1`; restored fields are validated before use. Calculated routes are not persisted and must be generated again. The nationwide storage key and compressed sharing format are unchanged. Short trips export Markdown and GPX and can print the roadbook; nationwide sharing is not offered for a short trip.

## Scheduling, verification and rollback

Daily driving is packed in route order under the chosen limit. Additional days are spent at the destination, and return driving ends on the final day. Where the requested trip is too short, generation fails with the minimum driving-day requirement. Multi-day legs show an unspecified overnight stop that still needs selection; daily kilometres are proportional estimates, while each complete leg keeps AMap's distance and duration. Rest, sightseeing and traffic delays are excluded from the driving limit calculation. No hotels, opening times or pet admission policies are invented.

Verify same-day return, insufficient days, long split legs, ordered waypoints, asymmetric return routes, year boundaries, invalid storage, missing keys, timeouts, late results, exports and existing nationwide behavior. Run Vitest, TypeScript, production build and isolated browser checks. Live AMap verification requires a configured key and reachable SDK and must be reported separately from mocked browser tests.

Rollback removes the short-trip entry points and new modules; the independent storage key can be left unused. No nationwide data or storage migration needs reversal.

## Verification record (2026-10-12)

- `npm test`: 209 tests passed, including scheduling/storage/export and AMap adapter regressions. `npm run typecheck` and `npm run build` passed; font subsets were regenerated.
- `python3 scripts/check_share_browser.py`: all nine nationwide sharing/storage scenarios passed. `python3 scripts/check_short_trip_browser.py`: mocked desktop/mobile generation, exports, invalid selection, daily limits, waypoint deletion, late results, failed routes and missing-key checks passed. These do not prove live service access.
- Live AMap place search from `127.0.0.1` returned `INVALID_USER_DOMAIN`. An isolated browser then loaded local production assets under `wanlilushu.cn` using request interception, without publishing: Hangzhou municipal government to Huzhou municipal government returned 90.1 km outbound and 86.9 km return, with toll estimates of CNY 29 and CNY 27. Both directions, map display and the two-day itinerary passed. This verifies that local build with the configured domain and credentials, not a deployed release.

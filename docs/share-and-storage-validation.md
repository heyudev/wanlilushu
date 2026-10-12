# Share links and local storage validation

English | [简体中文](分享与存档校验.md)

## Goal and affected code

Validate external settings before opening a plan so damaged share links or saved settings do not prevent the page from loading. The affected entry points are `decodePlan`, startup restoration in `App`, and share-result messages. Planning, cost rules, and form editing are unchanged.

Share links contain the differences from `DEFAULT_INPUT`, compressed with deflate-raw and stored in `?plan=` ([`share.ts`](../src/lib/share.ts#L8)). Local storage holds the complete input under `wanlilushu.input.v2` ([`App.tsx`](../src/App.tsx#L28)). Before this change, both entry points merged parsed JSON directly into the defaults without validating fields; see the previous implementations in [share decoding](https://github.com/heyudev/wanlilushu/blob/1ad6de999f3c526bf962d650743d73b416fce1df/src/lib/share.ts#L39) and [saved-plan loading](https://github.com/heyudev/wanlilushu/blob/1ad6de999f3c526bf962d650743d73b416fce1df/src/App.tsx#L34). `applyCustomStops` iterates over `custom`, while `buildPlan` reads dates and night counts. Parseable JSON alone is therefore insufficient ([`custom.ts`](../src/lib/custom.ts#L21), [`plan.ts`](../src/lib/plan.ts#L136)).

## Validation and compatibility

Both entry points use [`parsePlanInput`](../src/lib/input.ts#L92), which accepts plain objects. Missing fields use defaults, unknown fields are excluded, and an invalid supplied field rejects the entire plan. This preserves older plans that lack newer fields while avoiding silent changes to the user's route or prices.

Correcting fields individually could recover some settings, but replacing damaged route or cost inputs with defaults would leave users unable to identify which choices changed. Separate validators would duplicate the rules. A shared validator is used instead.

Rules follow the [`PlanInput`](../src/lib/types.ts#L274) and [`CustomStop`](../src/lib/types.ts#L77) definitions and the planner's existing constraints: at least one adult; integer child counts, nights, and long-stay week counts; positive driving-hour limits and stay multipliers; nonnegative costs and distances; and valid `YYYY-MM-DD` dates. Custom stop locations use WGS84 `[latitude, longitude]`, while their route geometry uses `[longitude, latitude]`, matching [`AddPlace.tsx`](../src/components/AddPlace.tsx#L24). Enum values follow the type definitions. Validation introduces no new business upper limits for prices, distances, or ordinary stays, no guessed price defaults, and no change to the Spring Festival date table.

Invalid saved settings return to the welcome screen with a message. The original saved content is retained until a new plan starts. An invalid share link preserves a valid existing plan; without one, the welcome screen remains visible. Messages reflect which state is shown. After decoding, only the `plan` query parameter is removed, preserving other parameters and the selected tab. Storage access failures and damaged content are reported separately; failed writes prompt users to retain a share link.

The share encoding, local storage key, and stored shape remain compatible with previous clients. This change adds no remote calls and does not alter the AMap client.

## Verification and rollback

Regression tests cover decompressible links with invalid fields, invalid dates and enums, negative costs, malformed custom stops and trips home, older plans missing fields, and unknown fields. Valid edited plans must survive an encode/decode round trip and remain usable by the planner.

Run `npm test`, `npm run typecheck`, `npm run fonts`, and `npm run build`. Browser checks cover startup, feedback, and URL handling for invalid saved settings, invalid links, and valid links. Live map-service checks are outside this change's scope.

Local verification on 2026-10-12 passed all four commands, with 188 unit tests passing. The four new share-validation cases failed before the implementation and passed afterward. Nine browser cases passed with no captured page errors. [`check_share_browser.py`](../scripts/check_share_browser.py) uses Python Playwright and its matching Chromium version; see the [installation and execution instructions](../README.md#optional-browser-checks). It uses isolated storage and blocks nonlocal network requests. These checks did not verify the live AMap service or a deployed release.

Rollback covers the input validator, changes to `share.ts` and `App.tsx`, associated tests, the browser script, and generated font files. No storage migration was performed, so rollback requires no conversion of user data.

## Public contribution checks

This is a GitHub open-source repository. Before the configuration additions, the browser script relied on a locally installed Python Playwright package without repository installation instructions. The existing `data-check.yml` generated research audit reports but did not check application tests or builds.

Keep the Python script and declare its optional dependency in a separate requirements file, with isolated installation instructions in the README. This avoids a second browser test implementation. Playwright is pinned to `1.58.0`, the locally tested version reported by `python3 -c 'from importlib.metadata import version; print(version("playwright"))'`. The dependency is optional and is not required for the frontend or unit tests.

The new [`ci.yml`](../.github/workflows/ci.yml) runs `npm ci`, `npm test`, and `npm run build` on pull requests and pushes to `main`, reading the Node version from `.node-version`. It uses GitHub-hosted runners, read-only repository permissions, official Actions pinned to full commit SHAs, and disabled checkout credential persistence. These choices follow [GitHub's secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use) and let public pull requests run the same checks without AMap or deployment secrets. The workflow performs checks only.

Validate the YAML and dependency declaration locally. Confirm GitHub execution after pushing; local checks do not establish a successful GitHub Actions run. Rollback covers the CI workflow, browser requirements file, README instructions, and virtual-environment ignore rule.

Local YAML parsing and checks of events, permissions, Action SHAs, and commands passed. `python3 -m pip install --dry-run --no-index -r scripts/requirements-browser.txt` succeeded and matched the verified local Playwright version. Neither a fresh dependency installation nor a GitHub-hosted workflow run was performed.

# Follower refresh diagnostic evidence

This evidence compares the exact `main` source at
`b4a6f42c6f985ea906e1641890f1132454cee5bb` with the application changes in this
pull request. Both static exports were built locally using the same installed,
lockfile-pinned dependencies. Evidence was collected on 2026-11-05 JST
(2026-11-04 UTC).

All browser journeys intercept Twitch requests and use synthetic tokens,
identities, follower rows, and dates. No real Twitch account was accessed for
these checks. Screenshots show invented `Visual ...` rows and `visual-...` IDs,
not the original reporter or a real follower list. Public files exclude browser
profile chrome, credentials, local paths, raw provider bodies, trace/HAR
archives, and the original reporter's account information.

## What the evidence establishes

- A valid, matching `/users` ID can continue when unused `login` or
  `display_name` metadata is empty or malformed.
- The exact old/new API boundary comparison changes six such cases and retains
  the outcome/error code in the other 96 cases. This is an acceptance comparison,
  not a claim that enriched error objects are byte-identical.
- Identity checks and follower response guards remain fail-closed. Failed
  refreshes preserve the previous baseline and check timestamp.
- Completed refreshes enqueue an allowlisted terminal event. Duplicate callers
  share one execution; aborted/unmounted executions do not emit a stale event.
- An absent, frozen, or throwing analytics observer cannot change refresh
  success/failure or corrupt the baseline.

These synthetic checks do not establish the original report's cause, the
frequency of malformed metadata in Twitch, native Safari/iOS/AT compatibility,
or receipt by a live analytics property.

## Files

| File | Purpose |
| --- | --- |
| [validation-summary.json](validation-summary.json) | Final local commands, results, matrix, and limits |
| [boundary-comparison.csv](boundary-comparison.csv) | Old/new outcome and code for 102 synthetic boundary cases |
| [boundary-summary.json](boundary-summary.json) | Boundary counts, interpretation, baseline revision, and application source hashes |
| [visual-summary.json](visual-summary.json) | Before/after PNG dimensions, size, SHA-256, and decoded comparisons when needed |
| [bundle-summary.json](bundle-summary.json) | JavaScript size estimate and CSS size/hash equality |
| [telemetry-examples.json](telemetry-examples.json) | Actual fixed-shape messages observed in the browser dataLayer during three synthetic journeys; no delivery claim |

The boundary corpus includes 100 native `Response` cases and two deliberately
nonconforming injected-fetch cases. The latter test the defensive boundary;
they are not examples of a valid browser `Response` or a provider guarantee.
The committed regression suites provide the maintained reproduction of these
boundaries:

- [API tests](../../../tests/twitch-api.test.mjs)
- [Telemetry tests](../../../tests/refresh-telemetry.test.mjs)
- [Browser journeys](../../../tests/e2e/dependency-regression.pw.ts)

`application_source_utf8_lf_sha256` hashes UTF-8 source after replacing CRLF with
LF. It intentionally differs from a raw Windows file hash when the checkout
uses CRLF. This normalization matches the source committed by Git and avoids
attributing newline conversion to a product change.

## Visual comparison

Desktop captures use a 1280×900 viewport; phone captures use 390×844. Full-page
images may be taller than the viewport. Capture data, theme, time, and viewport
are fixed between builds. The images are viewport/page captures without browser
profile chrome. No region is masked to conceal a product change.

| State | Desktop before / after | Phone before / after |
| --- | --- | --- |
| Normal success | [before](before-desktop-normal.png) / [after](after-desktop-normal.png) | [before](before-phone-normal.png) / [after](after-phone-normal.png) |
| Existing HTTP 500 failure after success | [before](before-desktop-error.png) / [after](after-desktop-error.png) | [before](before-phone-error.png) / [after](after-phone-error.png) |
| Empty optional user metadata | [before](before-desktop-optional-metadata.png) / [after](after-desktop-optional-metadata.png) | [before](before-phone-optional-metadata.png) / [after](after-phone-optional-metadata.png) |

The metadata case intentionally changes from a generic error with no newly
accepted rows to the normal successful follower grid. Page components, CSS,
labels, keyboard behavior, and controls are unchanged by this PR. Consult the
visual summary for measured equality rather than inferring pixel equality from
the absence of component changes.

Normal desktop and phone before/after captures have matching size and SHA-256.
The existing HTTP 500 phone captures also match. The existing desktop error
captures differ only at four border pixels, with a maximum channel difference
of 1 on the 0–255 scale. The metadata-recovery captures intentionally differ
from their failing baseline; the recovered screen matches the corresponding
normal-success screen.

Image comparison first checks file size and SHA-256. Matching files require no
byte-by-byte materialization. Only differing PNGs are decoded for pixel
comparison.

## Size and operations

The build emits the same number of JavaScript and CSS files. The root-route
JavaScript chunk increases by 4,073 bytes raw / approximately 1,354 bytes gzip.
The sum across all JavaScript files increases by 10,630 bytes raw / approximately
4,991 bytes gzip. Gzip is computed per file with a deterministic timestamp; this
is not a measured network transfer or loading-time benchmark. CSS file size and
SHA-256 pairs match between builds.

The Twitch request chain for an already-successful refresh is unchanged. The
recovered metadata case now proceeds to follower requests, which is the intended
behavior. No dependency, storage format, retry policy, or OAuth flow changes.

Automatic measurement in this PR means enqueueing
`follower_refresh_result` into the existing `window.dataLayer`. Live GTM tags and
GA4 receipt were not changed or verified. Activation and the exact payload
allowlist are documented in [refresh-diagnostics.md](../../refresh-diagnostics.md).

## Reproduction

With the repository's pinned dependencies and Playwright engines installed:

```sh
yarn lint
yarn typecheck
yarn test
yarn verify:dependencies
yarn build
yarn verify:artifact
yarn test:e2e --reporter=line
```

The final local aggregate run used `PLAYWRIGHT_TEST_PORT=4270` to isolate its
static server. It passed all 103 cases across the seven configured projects.
After removing trailing blank lines from two new files, lint, typecheck, all
170 Node cases, build, and artifact verification passed again. The repository's
`compare:artifacts` check also matched the validated export against this final
rebuild: JavaScript, CSS, and manifests have identical hashes; HTML matches after
the known Next.js build-ID normalization. This retains the browser evidence
without repeating the aggregate run for a whitespace-only change. Later
evidence documentation does not change the browser application.

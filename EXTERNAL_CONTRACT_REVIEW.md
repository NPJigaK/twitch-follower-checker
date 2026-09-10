# External Contract Review

This is the reusable English ledger and checklist for pull requests that depend on behavior outside this repository. Use it for Twitch/API responses, OAuth, browser or platform behavior, framework or dependency contracts, and hosted-service behavior or configuration.

The review is conditional and proportional. Select a tier using the rules below. Do not create a separate repository file for every pull request: copy the required record into the pull request description, or link to an already completed review record when one exists. A link to this blank reusable template is not a completed review.

## Review tiers

| Tier | Use when | Minimum record |
| --- | --- | --- |
| `N/A` | The change is documentation-only or internal and does not depend directly or indirectly on an external contract. | A specific reason identifying why no external behavior is relied on. |
| `Abbreviated` | The change is lockfile-only or metadata-only transitive maintenance; application code does not consume the changed contract; the affected implementation is not shipped in the browser/runtime; and no rejection, parsing, validation, navigation, persistence, authentication, or hosted-service behavior changes. | Resolved package/service and versions, primary release/advisory source and review date, reachability evidence, exact verification, artifact/browser comparison where the build path could affect output, and an explicit reason there is no changed rejection condition. |
| `Full` | The change affects API/OAuth request or response handling, parsing, validation, rejection, browser/platform behavior, framework runtime output, a direct runtime dependency, routing, persistence, authentication, a core interaction, or hosted-service behavior/configuration. Any new or changed condition that rejects, discards, invalidates, or refuses an external response or state always uses this tier. | The complete ledger, rejection challenge, evidence checklist, and applicable browser journey below. |

When uncertain, use the fuller tier. A reviewer must confirm the tier and rejection-condition coverage before merge. Calling a rule local, defensive, non-authoritative, or an implementation detail does not remove it from the full-review requirement if it can reject, discard, invalidate, or refuse external input or state.

## Review principles

- A provider contract is evidence, not a license to infer stronger invariants. Keep provider guarantees separate from local product assumptions.
- Review both failure directions:
  - Could accepting this input corrupt data or security state?
  - Could rejecting this input exclude a valid user or provider response?
- A new or changed rejection condition needs a primary-source basis, valid adjacent or counterexample states, and tests that cover accepted, rejected, and provider-permitted unusual responses.
- Fail-closed behavior must preserve last-good data and timestamps where applicable, and the user must have a recoverable UI or retry path where applicable.
- Use synthetic fixtures and redacted evidence only. Never use real access tokens, credentials, follower data, user data, or other sensitive information in contract tests or public evidence.

## How to complete the ledger

1. List every affected external behavior, including indirect behavior exposed by a framework, dependency, or hosted service.
2. For each behavior, cite the primary official source and record the exact section, version or revision, and date reviewed. A secondary explanation may provide context but cannot be the authority for a rejection rule.
3. Separate provider guarantees, provider-permitted states, undocumented or dynamic states, and local assumptions. If a value is dynamic or not guaranteed, do not use it as an authoritative completeness or validity check without a separate provider-supported invariant.
4. Map each contract statement to the exact code path and test or fixture that enforces it. Record what is intentionally not enforced when that prevents over-rejection.
5. For every new or changed rejection condition, complete the rejection challenge table. Include the false-acceptance risk, the false-rejection cost, data-preservation behavior, recovery path, and evidence.
6. Attach browser-journey evidence when the contract affects navigation, authentication, persistence, or a core interaction. Unit tests alone do not establish that the user can complete the journey.

## Reusable ledger

Copy this section into the pull request description and fill every applicable field. Add one row per contract area; split a row when different source statements or code paths need separate decisions.

### Applicability and scope

```text
Applicability: Applicable | N/A — <brief reason if not applicable>
Change summary:
Affected user journey(s), if any:
Author/reviewer:
Reviewed on (UTC):
```

### Contract ledger

| ID | External contract / area | Guaranteed by provider | Explicitly permitted by provider | Not guaranteed or dynamic | Local product assumption (must be labelled) | Primary official source, exact section, version/revision | Reviewed on (UTC) | Code mapping | Test/fixture mapping |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-1 | `<endpoint, OAuth step, browser/framework behavior, dependency, or hosted service>` | `<statement or None>` | `<permitted states or None>` | `<dynamic/undocumented states>` | `<assumption or None>` | `<URL + section + version/revision>` | `<YYYY-MM-DD>` | `<file/function/route>` | `<test/fixture/browser journey>` |

### Rejection-condition challenge

Complete one row for every new or changed condition that rejects, discards, invalidates, or refuses an external response or state. If there is no such condition, write `None` and explain why.

| Rejection condition | Primary-source statement proving the state is invalid | Provider-permitted adjacent/counterexample states | Over-acceptance risk | Over-rejection / availability cost | Last-good data and timestamp preserved? | User recovery or retry path | Positive, negative, and permitted-weird-response evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `<condition or None>` | `<URL + exact section, or None>` | `<synthetic fixture/state>` | `<what could go wrong if accepted>` | `<who could be excluded and how>` | `<behavior/evidence>` | `<UI, retry, or N/A with reason>` | `<test IDs, commands, or browser evidence>` |

### Evidence checklist

- [ ] The ledger covers every external contract affected directly or indirectly by this change.
- [ ] Every authoritative contract claim cites a primary official source with an exact section, reviewed version or revision, and review date.
- [ ] Every contract statement maps to the exact code path and test or fixture; intentionally unenforced assumptions are recorded.
- [ ] I challenged over-acceptance and over-rejection explicitly.
- [ ] Synthetic fixtures cover provider-permitted unusual responses where applicable.
- [ ] Fail-closed behavior preserves last-good data and timestamps where applicable.
- [ ] The user has a recoverable UI or retry path where applicable.
- [ ] Browser-journey evidence covers navigation, authentication, persistence, or core interaction changes where applicable.
- [ ] No real access token, credential, follower data, user data, or other sensitive information appears in tests or public evidence.
- [ ] The exact commands, test IDs, artifact checks, and browser evidence used for verification are recorded.

## Recheck triggers and recording

Recheck the relevant primary documentation and update the ledger when any trigger below occurs. Record the source URL and exact section, version or revision, date reviewed, affected code path, and the tests or browser evidence rerun. If the documentation changed but the product behavior did not, record that conclusion and why the existing tests remain sufficient.

| Contract category | Recheck when | Record and verify |
| --- | --- | --- |
| Twitch/API | An endpoint, API version, pagination or rate-limit rule, field definition, nullable/dynamic behavior, or provider incident changes; or code changes the request/response handling. | Twitch's current endpoint/reference and guide pages, API/version date, field assumptions, fixture IDs, request/response tests, and any production-safe smoke or browser evidence. |
| OAuth | The provider flow, redirect/parameter rule, token/session behavior, security guidance, or applicable OAuth specification changes; or code changes redirects, `state`, PKCE, token storage, refresh, logout, or callback handling. | The provider's official OAuth documentation and applicable RFC section, reviewed versions/date, flow assumptions, negative/replay fixtures, and a synthetic browser journey. |
| Framework/browser/platform | A framework, router, browser API, rendering, storage, history, or accessibility contract changes; or a framework/browser version or configuration changes. | The framework or platform's official documentation/release notes, exact version, affected route/component, unit/E2E/accessibility checks, and a browser journey when user interaction is affected. |
| Dependency | A dependency or resolution changes, a security/advisory or compatibility note changes, or code relies on a dependency's externally documented behavior. | The dependency maintainer's official release notes/API docs/advisory, exact resolved version, reason for the behavior, lockfile/build/test evidence, and any browser evidence required by the affected path. |
| Hosted service | A hosted provider changes API behavior, project/account settings, headers, quotas, deployment/runtime behavior, or documented limits; or this repository changes its integration/configuration. | The hosted provider's official documentation or change notice, service/version/configuration identifier without secrets, review date, integration tests, headers/smoke checks, and browser journey if applicable. |

Do not treat a stale copy, a remembered behavior, a green test suite, or a local fixture as proof that an external contract still holds. The ledger is the record of what was checked and what the product intentionally relies on.

## Regression case study and completed dry run: #298 and PR #299

Use [issue #298](https://github.com/NPJigaK/twitch-follower-checker/issues/298) and [PR #299](https://github.com/NPJigaK/twitch-follower-checker/pull/299) as the dry-run example for this gate.

The affected Twitch response was a dynamic paginated list. The regression made a mutable `total` value authoritative by treating an exact `retrieved count == total` relationship as a completeness invariant. That local assumption rejected a response the provider documents as valid. The ledger for a similar change must therefore say that mutable `total` is not authoritative, link the exact current Twitch source and review date, and map the decision to the pagination code and tests.

The counterexample tests must use synthetic, provider-permitted fixtures that vary the mutable `total` across pages or otherwise exercise the documented dynamic-list behavior. They must prove that a valid response is accepted without the invented exact-count rejection, while still rejecting genuinely invalid or unsafe states. The PR description should record the fixture/test IDs and the availability cost of reintroducing the old rejection.

This case study does not reopen the completed incident or change application behavior by itself; it defines the evidence expected before a future contract-dependent rejection rule is merged.

The following completed example shows the minimum evidence the old rejection rule should have received. It is a historical dry run, not a claim that PR #299 introduced a new rejection.

### Applicability and scope

```text
Applicability: Full
Change summary: Challenge and remove the exact retrieved-count-versus-total rejection used while traversing Get Channel Followers.
Affected user journey(s): Initial follower-list load and Refresh Lists for authenticated broadcasters.
Author/reviewer: Historical dry run for #301; independent review is still required on a real PR.
Reviewed on (UTC): 2026-09-10
```

### Contract ledger

| ID | External contract / area | Guaranteed by provider | Explicitly permitted by provider | Not guaranteed or dynamic | Local product assumption (must be labelled) | Primary official source, exact section, version/revision | Reviewed on (UTC) | Code mapping | Test/fixture mapping |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-298-1 | Twitch Get Channel Followers cursor traversal and `total` | A non-empty pagination cursor identifies a next request; an empty pagination object identifies the end of forward traversal. | A cursor can return an empty page near the end, and the same row can occur on multiple pages. | The follower `total` may change while paging; page contents are a dynamic view rather than one transactionally fixed snapshot. | Deduplicate rows by opaque `user_id` and treat `total` as diagnostic, not an exact completeness invariant. | [Twitch API Concepts, “Pagination”, “Forward pagination”, and “Lists are dynamic”](https://dev.twitch.tv/docs/api/guide/#pagination); [Get Channel Followers, “Response Body”, `pagination` and `total`](https://dev.twitch.tv/docs/api/reference/#get-channel-followers). Current web documentation publishes no page revision identifier. | 2026-09-10 | `lib/twitchApi.ts` — `parseFollowerPage` and `fetchAllFollowers` | `tests/twitch-api.test.mjs` — “a dynamic empty terminal page is accepted when valid rows were already traversed”, “a terminal total larger than the returned rows is diagnostic rather than authoritative”, “duplicate dynamic rows remain accepted when the terminal total increases”, and “a total decrease during pagination retains already traversed rows”; `tests/e2e/dependency-regression.pw.ts` — “dynamic terminal totals do not reject a completed cursor traversal” |

### Rejection-condition challenge

| Rejection condition | Primary-source statement proving the state is invalid | Provider-permitted adjacent/counterexample states | Over-acceptance risk | Over-rejection / availability cost | Last-good data and timestamp preserved? | User recovery or retry path | Positive, negative, and permitted-weird-response evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Historical rule: reject the completed traversal when the number of unique retrieved rows does not equal the terminal `total`. This rule was removed by PR #299 and must not be restored. | None. Twitch explicitly says `total` may change while paging, so the provider contract does not prove that a mismatch is invalid. | Synthetic pages with increasing or decreasing `total`, duplicate rows, or a valid empty terminal page after earlier rows. | Accepting a dynamic traversal can yield an eventually consistent observation rather than a transactionally exact snapshot; malformed schemas, invalid rows, repeated cursors, transport failures, and unavailable follower details remain separate fail-closed conditions. | A valid Twitch response is rejected, the core follower lists become unavailable, and every affected broadcaster is told to retry even though retrying cannot make the invented invariant authoritative. | Yes. On a genuine refresh failure, `lib/refreshCoordinator.ts` retains the last successful in-memory result, and baseline/date writes remain unavailable until a complete accepted refresh. | `components/AppContainer.tsx` explains that the last successful lists remain visible and offers Refresh Lists; the rejected exact-count rule itself is removed so valid dynamic responses no longer require recovery. | The four named unit fixtures above cover dynamic totals, duplicates, and an empty terminal page; the named synthetic Playwright journey covers the user-visible accepted result. Existing malformed-schema, cursor-loop, HTTP, abort, and partial-page tests remain negative evidence. |

### Dry-run verification record

- `yarn lint`
- `yarn typecheck`
- `yarn test`
- `yarn build`
- `yarn verify:artifact`
- `yarn test:e2e --grep "dynamic terminal totals do not reject"`
- No real access token, credential, follower record, or user record is used; all contract fixtures are synthetic.

## Primary-source starting points

These links are starting points only; reviewers must verify the current page, section, version, and date for the contract under review.

- [Twitch API guide](https://dev.twitch.tv/docs/api/guide/)
- [Twitch Get Channel Followers reference](https://dev.twitch.tv/docs/api/reference/#get-channel-followers)
- [RFC 9700 — OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html)
- [RFC 10017](https://www.rfc-editor.org/rfc/rfc10017.html)

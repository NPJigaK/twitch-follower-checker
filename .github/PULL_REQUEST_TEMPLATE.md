## What changed

<!-- Explain what changed and why. Link any related issue. -->

## Verification

<!-- List the commands or manual checks you ran. -->

## External Contract Review

<!--
Conditional gate. Choose the N/A, abbreviated, or full tier using the criteria in
`EXTERNAL_CONTRACT_REVIEW.md`. If this contribution is documentation-only or
internal and does not depend on a Twitch/API, OAuth, browser/platform,
framework/dependency, or hosted-service contract, write `N/A — <specific reason>`
below and skip the details. Otherwise paste a completed ledger here or link to a
completed review record. Do not link to the blank reusable template.
-->

Applicability: `N/A — <specific reason>` | `Abbreviated — <completed record>` | `Full — <completed ledger>`

Reviewer confirmation: `Pending` | `<reviewer/review link/date confirming the tier and rejection-condition coverage>`

<details>
<summary>Checklist for applicable external-contract changes</summary>

Contract ledger / review record: `<link or paste the completed record; all applicable placeholders must be replaced>`

New or changed conditions that reject, discard, invalidate, or refuse an external response or state: `<None — give a specific reason>` or `<completed rows in the ledger>`

- [ ] I listed each affected external contract and mapped its provider statement to the exact code path and tests/fixtures.
- [ ] I cited a primary official source for each authoritative claim, including the exact section, reviewed version/revision, and review date.
- [ ] I separated provider guarantees, explicitly permitted states, dynamic/not-guaranteed states, and local product assumptions.
- [ ] I documented every new or changed condition that rejects, discards, invalidates, or refuses an external response or state, whether or not I consider it authoritative; or I gave a specific reason that there is none.
- [ ] I challenged both over-acceptance (data/security corruption) and over-rejection (excluding a valid user/provider response).
- [ ] I tested positive, negative, and provider-permitted unusual responses for each new or changed rejection condition.
- [ ] I recorded fail-closed last-good data/timestamp preservation and a recoverable UI/retry path where applicable.
- [ ] I attached browser-journey evidence for navigation, authentication, persistence, or core interaction contracts where applicable.
- [ ] I used synthetic fixtures and redacted evidence only; no real tokens, credentials, follower/user data, or other sensitive data are included.
- [ ] I recorded any documentation/version/configuration recheck and the evidence rerun.
- [ ] A reviewer confirmed that the selected tier is appropriate, the record is completed rather than blank, and rejection-condition coverage is not hidden behind `N/A`, `None`, or a local assumption.

</details>

## Checklist

- [ ] I have read `CONTRIBUTING.md`.
- [ ] I created this contribution or have permission to submit it.
- [ ] I identified the source and license of any third-party or materially AI-generated content.
- [ ] This contribution contains no credentials, personal information, confidential information, or malicious code.
- [ ] I ran the checks relevant to this change, or explained above why a check was not run.
- [ ] I have read and agree to version 1.0 of the [Contributor License Agreement](https://github.com/NPJigaK/twitch-follower-checker/blob/main/CONTRIBUTOR_LICENSE_AGREEMENT.md).

# Contributing to Twitch Follower Checker

Issues, draft pull requests, and completed pull requests are welcome. For a large or potentially breaking change, please open an issue or draft pull request first so the approach can be discussed before significant work begins.

## Development workflow

1. Fork the repository and create a focused branch.
2. Keep the change as small and reviewable as practical.
3. Add or update tests when behavior changes.
4. Describe what changed, why it changed, and how it was verified in the pull request.

The continuous-integration checks run the full project validation. Before opening a pull request, run the checks relevant to your change when practical:

```sh
yarn lint
yarn typecheck
yarn test
yarn build
```

## External contract review

Changes that rely on behavior outside this repository require a proportionate external-contract review. This includes Twitch/API responses, OAuth, browser or platform behavior, framework and dependency contracts, and hosted-service behavior or configuration. The pull request template keeps this gate conditional: documentation-only or internal changes that do not depend on an external contract may mark it `N/A` with a specific reason. Lockfile-only transitive maintenance that cannot reach the browser or application runtime may use the abbreviated tier. Changes to externally governed runtime behavior, or any condition that rejects, discards, invalidates, or refuses an external response or state, require the full tier.

For an applicable change:

1. Complete or link the reusable [External Contract Review ledger and checklist](EXTERNAL_CONTRACT_REVIEW.md) in the pull request description.
2. Use a primary official source for every contract claim. Record the exact URL or section, reviewed version or revision, and review date, then map each claim to the affected code and tests.
3. Record what the provider guarantees, explicitly permits, does not guarantee or treats as dynamic, and what is only a local product assumption. A local assumption must not silently become an authoritative rejection condition.
4. Challenge both directions: could accepting the input corrupt data or security state, and could rejecting it exclude a valid user or provider response? New or changed rejection conditions need positive, negative, and provider-permitted unusual-response tests.
5. Where applicable, show that fail-closed paths preserve last-good data and timestamps, that the user has a recoverable UI or retry path, and that a browser journey covers changes to navigation, authentication, persistence, or core interaction.
6. Use synthetic fixtures and redacted evidence only. Never put real access tokens, credentials, follower data, user data, or other sensitive information in tests or public review evidence.
7. Recheck and record the contract when the provider documentation, API or OAuth version, framework or dependency version, or hosted-service behavior/configuration changes. The ledger explains the triggers and the evidence to retain for each category.

Before merge, a reviewer must confirm that the selected tier is appropriate, that an applicable record is actually completed rather than linked to the blank template, and that no rejection condition is hidden behind `N/A`, `None`, the word `non-authoritative`, or an unlabeled local assumption.

The completed [#298](https://github.com/NPJigaK/twitch-follower-checker/issues/298) incident and [PR #299](https://github.com/NPJigaK/twitch-follower-checker/pull/299) are the regression case study: a mutable `total` in a dynamic paginated Twitch response was treated as an authoritative completeness invariant. A new rejection rule must document the primary-source basis and test the provider-permitted counterexamples before it can be used to reject a response.

## Submission rules

- Submit only material that you created or are authorized to contribute.
- Do not copy third-party code, documentation, images, fonts, data, or other material without permission.
- Identify the source and license of any third-party material included in a contribution.
- Disclose materially AI-generated content and confirm that you have reviewed it and may submit it under these terms.
- Do not include access tokens, credentials, personal information, confidential information, or malicious code.
- Keep security vulnerabilities out of public issues. Use [GitHub's private vulnerability reporting](https://github.com/NPJigaK/twitch-follower-checker/security/advisories/new) instead.

Ideas, feature requests, questions, and general feedback posted in issues or discussions are public. They are not code contributions under the Contributor License Agreement unless their author expressly submits them for inclusion in the project.

## Project license

The current source code is made available under the [PolyForm Perimeter License 1.0.1](LICENSE). The license does not permit using the software to provide a competing product or service. Third-party material remains subject to its respective license, as described in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Contributor License Agreement

Code, documentation, tests, assets, and other material submitted for inclusion through a pull request require acceptance of the [Contributor License Agreement](CONTRIBUTOR_LICENSE_AGREEMENT.md).

Accept the agreement by selecting the CLA checkbox in the pull request template. Every human author and co-author must have accepted the current agreement. Copyright in a contribution remains with its contributor; the agreement grants the project the rights needed to maintain, distribute, and relicense the contribution.

The maintainer may decline any contribution, request changes, or ask for additional evidence that third-party material may be submitted.

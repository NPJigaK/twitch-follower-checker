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

# Follower refresh diagnostics

The follower refresh can reject a successful `/users` response when its user ID
is valid but unused `login` or `display_name` metadata is empty or malformed.
The client now copies those optional application fields only when they are
non-empty strings. It still requires a single user, a valid ID, and equality with
the subject validated by Twitch. This is an application compatibility decision;
it does not claim that Twitch documents malformed metadata as a valid response
or that this was the cause of a particular user report.

Follower rows, pagination, count-only responses, HTTP failures, baseline storage,
and Check Done keep their existing acceptance rules. The successful layout,
controls, and public error messages are unchanged. No logout, retry, storage
migration, or offline-list behavior is introduced by this change.

## Automatic result events

One completed, non-aborted single-flight refresh enqueues one
`follower_refresh_result` message through the existing `window.dataLayer` path.
Discarded Strict Mode executions, unmounted executions, and coalesced callers do
not produce extra terminal messages. Reporting is best effort: missing or broken
analytics must not change the refresh or baseline result.

The application constructs a new payload from fixed allowlists. It never spreads
the provider response or an Error into the message.

| Parameter | Values / meaning |
| --- | --- |
| `event` | `follower_refresh_result` |
| `diagnostic_schema` | `1` |
| `app_version` | The repository application version, currently `2.2.0` |
| `outcome` | `success` or `failure` |
| `code` | Existing refresh problem code, `none`, or `unknown` |
| `stage` | `validate`, `users`, `followers`, `baseline_read`, `baseline_write`, `comparison`, `complete`, or `unknown` |
| `reason` | A reviewed response-boundary reason, `none`, or `unknown` |
| `page_bucket` | `none`, `1`, `2_3`, `4_10`, or `11_plus` |
| `status_class` | `none`, `2xx`, `3xx`, `4xx`, or `5xx` |
| `compatibility` | `none` or `ignored_user_metadata` |

The message contains no token, Authorization header, Twitch user or broadcaster
ID, follower ID, login, display name, raw response, raw error message, request
URL, query, cursor, cursor hash, user agent, or stable application-generated
visitor identifier. Internal page numbers and HTTP statuses are reduced to the
coarse values above before enqueueing. Unknown runtime values are not forwarded.

This allowlist describes the application-authored message. Existing analytics
tags may add their own standard context. Activation checks must inspect the
receiving tag's complete output, including automatically attached context and
any inherited variables, using synthetic fixtures.

`compatibility=ignored_user_metadata` records that the unused metadata was
ignored during this attempt. Only a message that also has `outcome=success`
establishes that this attempt completed even though the old client would have
rejected that metadata. A failure can carry the same flag when another part of
the refresh subsequently failed.

Success and failure terminal events describe completed observed attempts. They
do not count abandoned requests or analytics-blocked visits. Absence of received
events is not evidence that a bug has been resolved. This instrumentation cannot
retroactively identify the response seen by a previous reporter.
The instrumented journey starts after authentication: a startup token-validation
failure does not instantiate a follower refresh and is not in this denominator.

## GTM / GA4 activation

Enqueueing a data-layer message does **not** prove that a Google Tag Manager tag
fired or that GA4 received it. The repository does not contain the private GTM
container configuration. No live GTM, GA4, consent, or analytics account settings
are changed by this pull request.

To activate collection through the existing container:

1. Add a Custom Event trigger with event name `follower_refresh_result`.
2. Attach a native GA4 Event tag using the existing configured Google tag and
   event name `follower_refresh_result`.
3. Map only the parameters in the table above using Data Layer Variables. Do not
   attach provider objects, URLs, names, or arbitrary error fields.
4. Register event-scoped custom dimensions where reporting needs them.
5. In Preview / Tag Assistant, verify a synthetic success, a synthetic failure,
   and a synthetic successful `ignored_user_metadata` attempt.
6. Verify the allowlisted event payload and actual receipt in the receiving
   property. Preview and receiving-property checks use synthetic fixtures only.

The existing analytics behavior and maintainer decision in
[#213](https://github.com/NPJigaK/twitch-follower-checker/issues/213) are not
reopened or made prerequisites by this work. A new analytics vendor or server is
not required.

## Verification and evidence

API tests cover malformed unused metadata, valid and invalid identities,
response context, and non-fatal notice observers. Telemetry tests cover the
exact payload, hostile runtime values, coarse buckets, and unavailable or
throwing observers. Browser tests exercise actual refresh integration,
single-flight reporting, data retention, and synthetic failure/recovery.

The committed evidence under
[`evidence/follower-refresh-diagnostics`](evidence/follower-refresh-diagnostics)
uses synthetic identities and follower rows. Normal-success and genuine-error
screens are compared separately from the intended recovery of the previously
rejected unused-metadata case. Screenshots do not contain browser profile chrome
or real account information.

Before merge, run the complete checks in `CONTRIBUTING.md`, the aggregate
configured Playwright matrix in `BROWSER_SUPPORT.md`, and the completed external
contract review included in the pull request. Playwright WebKit and emulated
devices are not evidence of native Safari, iOS WebView, or assistive-technology
verification.

## Primary references

- [Twitch Get Users: Authorization and Response Body](https://dev.twitch.tv/docs/api/reference/#get-users)
- [Twitch Get Channel Followers: Authorization and Response Body](https://dev.twitch.tv/docs/api/reference/#get-channel-followers)
- [Twitch API Concepts: Pagination and Lists are dynamic](https://dev.twitch.tv/docs/api/guide/#pagination)
- [Google: Data-layer processing and Custom Event triggers](https://developers.google.com/tag-platform/tag-manager/datalayer#how_data_layer_information_is_processed)

Reviewed on 2026-11-05. These web documents do not publish a fixed revision ID.

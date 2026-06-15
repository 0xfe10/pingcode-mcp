# pingcode-mcp Specification Delta

## ADDED Requirements

### Requirement: Authorization Retry on 401

When a request fails with HTTP 401, the server SHALL attempt a single re-authorization and retry: force-refresh the user token when a refresh token exists, otherwise invalidate the client-credentials cache. It SHALL NOT retry more than once and SHALL NOT apply this retry to the token endpoint itself.

#### Scenario: User token refreshed on 401

- **WHEN** a request returns 401
- **AND** a stored user refresh token exists
- **THEN** the server refreshes the user token once and retries the request with the new token.

#### Scenario: No infinite retry

- **WHEN** the retried request also fails
- **THEN** the server returns the error without further retries.

### Requirement: Result Truncation Indicators

`pingcode_search_work_items` and `pingcode_get_my_work` SHALL indicate when results exceed the returned page rather than silently dropping them, via a `truncated` flag (and per-kind `hasMore`).

#### Scenario: Truncated search

- **WHEN** a kind's total exceeds the returned page size
- **THEN** the result reports `hasMore` for that kind and `truncated=true`.

### Requirement: Secret-Safe Error Serialization

`PingCodeApiError` SHALL provide a serialization that excludes the raw response body, and SHALL offer masking of token/secret patterns for any diagnostic exposure.

#### Scenario: Error serialization omits body

- **WHEN** a `PingCodeApiError` is serialized via `toJSON`
- **THEN** the output contains name, message, and status only, not the raw response body.

### Requirement: Automated Test Coverage

The package SHALL provide an `npm test` script using the built-in test runner (no third-party framework) covering: dry-run no-write, readonly rejection, authorization priority and refresh, search merge/dedup/truncation, personal-work grouping, token-store 0600 permissions, and setup config masking.

#### Scenario: Tests run green

- **WHEN** `npm test` is run
- **THEN** the suite passes covering the invariants above.

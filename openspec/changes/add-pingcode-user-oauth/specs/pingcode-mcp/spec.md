# pingcode-mcp Specification Delta

## ADDED Requirements

### Requirement: User-Mode OAuth Authorization

The MCP server SHALL support PingCode OAuth authorization-code login so a user can authorize the MCP via browser and have the server act as that user.

The server SHALL expose login, status, and logout tools. Login without a code SHALL return an authorization URL and guidance; login with a code SHALL exchange it (with the client secret) for user tokens, persist them, and return the resolved current user.

The server SHALL persist user tokens to a local file with 0600 permissions and SHALL never log or return access or refresh tokens.

The server SHALL NOT read browser cookies, localStorage, or sessionStorage, and SHALL NOT require pasting a web-login token.

#### Scenario: Begin login

- **WHEN** the caller invokes `pingcode_auth_login` without a code
- **AND** a client id is configured
- **THEN** the server returns the authorization URL and instructions to paste back the callback code
- **AND** does not return any token.

#### Scenario: Complete login with code

- **WHEN** the caller invokes `pingcode_auth_login` with a `code`
- **THEN** the server exchanges it for user tokens, persists them with 0600 permissions, and returns the current user
- **AND** the response contains no access or refresh token.

#### Scenario: Auth status without leaking tokens

- **WHEN** the caller invokes `pingcode_auth_status`
- **THEN** the server reports the auth mode, whether a user token is present, the relative expiry, and the current user
- **AND** the response contains no token value.

#### Scenario: Logout

- **WHEN** the caller invokes `pingcode_auth_logout`
- **THEN** the server clears the stored user tokens.

### Requirement: Authorization Priority and Refresh

The server SHALL select credentials in priority order: stored user token (auto-refreshed when expired), then `PINGCODE_ACCESS_TOKEN`, then client credentials.

When a user token is expired and a refresh token exists, the server SHALL refresh it, preserving the original refresh token if none is returned.

#### Scenario: User token preferred

- **WHEN** a valid stored user token exists
- **THEN** the server authorizes requests with the user token rather than client credentials.

#### Scenario: Auto refresh

- **WHEN** the stored user token is expired and a refresh token exists
- **THEN** the server refreshes the access token before the request and persists the new token.

#### Scenario: Fallback when not authorized

- **WHEN** no usable stored user token exists
- **THEN** the server falls back to `PINGCODE_ACCESS_TOKEN`, then client credentials, preserving existing behavior.

### Requirement: Current User Without Manual Assignee

When authorized as a user, the server SHALL resolve the current user from `/v1/myself` for `pingcode_get_current_user` and for the "my work item" tools, so they no longer require `PINGCODE_DEFAULT_ASSIGNEE_NAME`.

#### Scenario: Real current user

- **WHEN** authorized as a user
- **AND** the caller invokes `pingcode_get_current_user`
- **THEN** the server returns the real `/v1/myself` user.

#### Scenario: My work items use current user

- **WHEN** authorized as a user
- **AND** the caller invokes `pingcode_list_my_bugs` without configuring `PINGCODE_DEFAULT_ASSIGNEE_NAME`
- **THEN** the server filters by the current user's display name.

#### Scenario: Application-mode fallback unchanged

- **WHEN** not authorized as a user
- **THEN** `pingcode_get_current_user` degrades to the configured default assignee as before.

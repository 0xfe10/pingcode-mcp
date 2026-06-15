# pingcode-mcp Specification Delta

## ADDED Requirements

### Requirement: Directory Queries

The MCP server SHALL expose read-only tools to get the current enterprise/team and the enterprise member list.

The MCP server SHALL expose a current-user tool that, under application (client credentials) identity where PingCode has no logged-in user, degrades to returning the configured default assignee instead of failing.

The member list tool SHALL support filtering by keywords and department IDs.

#### Scenario: Get current team

- **WHEN** the caller invokes `pingcode_get_current_team`
- **THEN** the server returns the enterprise/team information
- **AND** does not expose the access token.

#### Scenario: Get team members with filters

- **WHEN** the caller invokes `pingcode_get_team_members` with `keywords` and/or `departmentIds`
- **THEN** the server returns matching enterprise members with pagination.

#### Scenario: Current user under application identity

- **WHEN** the caller invokes `pingcode_get_current_user`
- **AND** the server runs under client credentials with no usable user token
- **THEN** the server does not error
- **AND** returns an application-identity result including the configured default assignee.

#### Scenario: Current user under user token

- **WHEN** `PINGCODE_ACCESS_TOKEN` is configured and usable as a user token
- **THEN** the server returns the resolved current user.

### Requirement: Raw Work Item Filters

The MCP server SHALL extend the unified search tool with raw ID filters (project, type, parent, assignee, state, priority, tag, sprint, board, entry, swimlane, phase, version, created-by), a single participant filter, created/start/end time-range filters, and include-deleted/include-archived flags.

The search tool SHALL keep the existing name-based filters (state names, priority names, assignee names) and SHALL merge name-resolved IDs with raw IDs, de-duplicated, capped at 20 per field.

The search tool SHALL de-duplicate merged results by work item ID.

#### Scenario: Merge name and raw filters

- **WHEN** the caller passes both `stateNames` and `stateIds`
- **THEN** the server resolves the names to IDs and merges them with the raw IDs
- **AND** de-duplicates and caps the combined list at 20.

#### Scenario: Raw passthrough filters

- **WHEN** the caller passes `sprintIds`, `versionIds`, `tagIds`, `createdBetween`, or `includeArchived`
- **THEN** the server forwards them as the corresponding PingCode query parameters.

#### Scenario: Backward compatibility

- **WHEN** existing list tools call the work item listing without raw filters
- **THEN** the resulting query is unchanged from before.

# pingcode-mcp Specification Delta

## ADDED Requirements

### Requirement: Work Item Detail

The MCP server SHALL expose a tool that returns a single work item's full detail by identifier or work item ID, including description, rich-text image metadata, created/updated timestamps, parent, and custom properties, and optionally its comments.

The MCP server SHALL resolve a caller-provided identifier to the internal work item ID before requesting single-item detail, because the PingCode detail endpoint addresses items by internal ID.

#### Scenario: Get detail by identifier

- **WHEN** the caller invokes `pingcode_get_work_item` with `identifier=PROJ-455`
- **THEN** the server resolves the work item and returns title, description, state, priority, assignee, parent, properties, created_at, updated_at, and image metadata
- **AND** does not expose the access token.

#### Scenario: Get detail by work item ID

- **WHEN** the caller invokes `pingcode_get_work_item` with `workItemId` set
- **THEN** the server fetches the single work item via the PingCode detail endpoint
- **AND** returns the full detail without relying on paginated list filtering.

#### Scenario: Include comments

- **WHEN** the caller invokes `pingcode_get_work_item` with `includeComments=true`
- **THEN** the server additionally returns the work item's comments.

### Requirement: Unified Work Item Search

The MCP server SHALL expose a tool that searches defects and requirements together, filtered by keywords, state names, priority names, assignee names, and an updated-time range, with pagination.

The MCP server SHALL resolve state and priority names per work item kind, because state definitions differ by work item type.

The MCP server SHALL map `updatedAfter`/`updatedBefore` to the PingCode server-side `updated_between` filter.

#### Scenario: Search across kinds

- **WHEN** the caller invokes `pingcode_search_work_items` without `kinds`
- **THEN** the server searches both defects and requirements
- **AND** returns a merged list with per-kind totals.

#### Scenario: Filter by updated time

- **WHEN** the caller invokes `pingcode_search_work_items` with `updatedAfter` set
- **THEN** the server sends the PingCode `updated_between` query parameter
- **AND** returns only work items updated within the range.

### Requirement: Status Change Planning

The MCP server SHALL expose a read-only tool that returns a status change plan for a work item, including current status, target status, available states, and whether an expected-current-status guard is satisfied.

The MCP server SHALL NOT execute any write when planning a status change.

The MCP server SHALL indicate that PingCode does not validate workflow transitions, so a planned target may still be rejected on actual update.

#### Scenario: Plan a status change

- **WHEN** the caller invokes `pingcode_plan_status_change` with `identifier=PROJ-455` and `statusName=已修复`
- **THEN** the server returns the current status, resolved target state, and available states
- **AND** sends no PATCH request.

#### Scenario: Expected current status guard in plan

- **WHEN** the caller passes `expectedCurrentStatusName`
- **THEN** the plan reports whether the current status matches the expectation
- **AND** still performs no write.

### Requirement: Safe Field Editing

The MCP server SHALL expose a tool that edits a work item's title, description, priority, assignee, parent, and properties by identifier or work item ID.

The tool SHALL default `dryRun` to true and SHALL only send a PATCH request when `dryRun=false`.

The tool SHALL compute a field-level diff, SHALL skip the write when no field changes, and SHALL reject the write when `expectedCurrentStatusName` does not match.

The tool SHALL be blocked when `PINGCODE_READONLY=true`.

#### Scenario: Dry-run field edit

- **WHEN** the caller invokes `pingcode_update_work_item_fields` without `dryRun=false`
- **THEN** the server returns the resolved payload and field diff only
- **AND** sends no PATCH request.

#### Scenario: Execute field edit

- **WHEN** the caller invokes `pingcode_update_work_item_fields` with `dryRun=false`
- **AND** at least one field changes
- **THEN** the server sends a PATCH request with only the changed fields.

#### Scenario: No-op field edit

- **WHEN** the requested field values already match the current work item
- **THEN** the server reports `noChange` and sends no PATCH request.

#### Scenario: Readonly blocks field edit

- **WHEN** `PINGCODE_READONLY=true`
- **AND** the caller invokes `pingcode_update_work_item_fields` with `dryRun=false`
- **THEN** the server rejects the write before sending any request.

### Requirement: Work Item Triage

The MCP server SHALL expose a tool that combines assignee change, priority change, status change, and an optional comment into a single triage action for a work item.

The tool SHALL default `dryRun` to true, SHALL return a combined plan, and SHALL only execute when `dryRun=false`.

The tool SHALL reject the entire action when `expectedCurrentStatusName` does not match, without partial execution.

The tool SHALL be blocked when `PINGCODE_READONLY=true`.

#### Scenario: Dry-run triage

- **WHEN** the caller invokes `pingcode_triage_work_item` with `assigneeName`, `priorityName`, `statusName`, and `comment`, without `dryRun=false`
- **THEN** the server returns a plan describing the field diff, status change, and comment to add
- **AND** sends no write request.

#### Scenario: Execute triage

- **WHEN** the caller invokes `pingcode_triage_work_item` with `dryRun=false`
- **THEN** the server applies field and status changes in a single PATCH
- **AND** adds the comment when provided.

#### Scenario: Triage guard rejects on mismatch

- **WHEN** `expectedCurrentStatusName` does not match the current status
- **AND** `dryRun=false`
- **THEN** the server rejects the whole triage action and performs no partial update.

### Requirement: Secret-Safe Error Output

The MCP server SHALL return only sanitized error messages from new tools and SHALL NOT return raw PingCode response bodies, tokens, or client secrets.

#### Scenario: Sanitized error

- **WHEN** a new tool encounters a PingCode API error
- **THEN** the server returns the error message only
- **AND** does not include the raw response body, access token, or client secret.

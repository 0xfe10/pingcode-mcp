# pingcode-mcp Specification Delta

## ADDED Requirements

### Requirement: Single Work Item Creation

The MCP server SHALL expose a tool that creates a single defect or requirement with a required title and optional description, priority, assignee, parent, initial status, and properties.

The tool SHALL default `dryRun` to true and SHALL only send a create request when `dryRun=false`.

The tool SHALL be blocked when `PINGCODE_READONLY=true`.

The tool SHALL resolve priority, assignee, parent, and status names to their PingCode IDs before building the create payload.

#### Scenario: Dry-run create

- **WHEN** the caller invokes `pingcode_create_work_item` with a `title` and without `dryRun=false`
- **THEN** the server returns the resolved create payload as a plan
- **AND** sends no create request.

#### Scenario: Execute create

- **WHEN** the caller invokes `pingcode_create_work_item` with `dryRun=false`
- **THEN** the server sends a create request with project, type, and title
- **AND** returns the created work item including its identifier.

#### Scenario: Readonly blocks create

- **WHEN** `PINGCODE_READONLY=true`
- **AND** the caller invokes `pingcode_create_work_item` with `dryRun=false`
- **THEN** the server rejects the creation before sending any request.

### Requirement: Native Bulk Work Item Update

The MCP server SHALL expose a tool that updates priority, assignee, or status for a list of work item identifiers using PingCode's native bulk update endpoint.

The tool SHALL default `dryRun` to true, SHALL support an `expectedCurrentStatusName` guard that skips non-matching items, and SHALL report planned, skipped, and failed items.

The tool SHALL be blocked when `PINGCODE_READONLY=true`.

#### Scenario: Dry-run bulk update

- **WHEN** the caller invokes `pingcode_bulk_update_work_items` with identifiers and a target field without `dryRun=false`
- **THEN** the server returns planned, skipped, and failed lists
- **AND** sends no update request.

#### Scenario: Execute bulk update

- **WHEN** the caller invokes `pingcode_bulk_update_work_items` with `dryRun=false`
- **THEN** the server sends one native bulk update request per changed field for the eligible work item IDs.

#### Scenario: Guard skips non-matching items

- **WHEN** `expectedCurrentStatusName` is set
- **AND** an item's current status does not match
- **THEN** the server skips that item and reports it as skipped.

### Requirement: Workflow-Aware Status Change Planning

The MCP server SHALL enhance the status change planning tool to return the legal target states reachable from the current state, resolved via the work item type's state plan and state flows.

When the state plan cannot be resolved, the tool SHALL fall back to listing all states and SHALL indicate that legal transitions could not be pre-checked.

The tool SHALL remain read-only.

#### Scenario: Plan with legal transitions

- **WHEN** the caller invokes `pingcode_plan_status_change` and the state plan resolves
- **THEN** the server returns the legal transitions reachable from the current state
- **AND** indicates whether the requested target is among them
- **AND** sends no write request.

#### Scenario: Fallback when state plan unresolved

- **WHEN** the state plan cannot be matched for the work item type
- **THEN** the server returns all states as before
- **AND** notes that legal transitions were not pre-checked.

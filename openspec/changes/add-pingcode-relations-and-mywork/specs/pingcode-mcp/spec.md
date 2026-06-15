# pingcode-mcp Specification Delta

## ADDED Requirements

### Requirement: Work Item Relations

The MCP server SHALL expose tools to create, delete, and list relations (links) between work items, supporting relation types such as block, blocked_by, duplicate, relate, cause, and dependency.

The create and delete tools SHALL default `dryRun` to true and SHALL be blocked when `PINGCODE_READONLY=true`.

The server SHALL resolve a relation type from a system enum value directly, otherwise by name or ID via the relation types endpoint, falling back to the raw input.

#### Scenario: Dry-run link

- **WHEN** the caller invokes `pingcode_link_work_items` with source, target, and relation type without `dryRun=false`
- **THEN** the server returns the link plan
- **AND** sends no write request.

#### Scenario: Execute link

- **WHEN** the caller invokes `pingcode_link_work_items` with `dryRun=false`
- **THEN** the server resolves source and target IDs and the relation type
- **AND** creates the relation on the source work item.

#### Scenario: List relations

- **WHEN** the caller invokes `pingcode_list_work_item_relations` for a work item
- **THEN** the server returns its relations, optionally filtered by relation type
- **AND** sends no write request.

#### Scenario: Unlink requires relation ID

- **WHEN** the caller invokes `pingcode_unlink_work_items` with a `relationId`
- **AND** `dryRun=false`
- **THEN** the server deletes that relation from the work item.

#### Scenario: Readonly blocks link and unlink

- **WHEN** `PINGCODE_READONLY=true`
- **AND** the caller invokes a link or unlink tool with `dryRun=false`
- **THEN** the server rejects the write before sending any request.

### Requirement: Personal Work Queue

The MCP server SHALL expose a read-only tool that aggregates the current user's defects and requirements grouped by status, with per-status counts, supporting an assignee override and state/updated-time filters.

#### Scenario: Aggregate my work by status

- **WHEN** the caller invokes `pingcode_get_my_work`
- **AND** a default assignee is configured or provided
- **THEN** the server returns the user's work items grouped by status with counts
- **AND** de-duplicates items by work item ID
- **AND** sends no write request.

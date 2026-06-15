# pingcode-mcp Specification Delta

## ADDED Requirements

### Requirement: Project Schema Discovery

The MCP server SHALL expose a tool that returns the resolved project, work item types, states, priorities, and members for a PingCode project.

The MCP server SHALL expose a setup check tool that guides users to provide missing configuration through chat and local env.

#### Scenario: Resolve project schema

- **WHEN** the caller invokes `pingcode_get_project_schema` with `projectIdentifier=<PROJECT_KEY>`
- **THEN** the server queries PingCode project APIs
- **AND** returns type/state/priority/member data without exposing the access token.

#### Scenario: Setup guide for missing fields

- **WHEN** the caller invokes `pingcode_check_setup`
- **THEN** the server returns missing configuration fields
- **AND** marks whether each field is safe to provide in chat
- **AND** tells the user where to find the value in PingCode
- **AND** includes a copyable environment variable template.

### Requirement: Work Item Listing

The MCP server SHALL expose separate tools for listing defects and requirements.

The MCP server SHALL expose "my work item" tools that filter by the configured default assignee name.

#### Scenario: List defects

- **WHEN** the caller invokes `pingcode_list_bugs`
- **THEN** the server filters work items by the configured bug work item type.
- **AND** returns rich-text image metadata such as image count and source URLs.

#### Scenario: List requirements

- **WHEN** the caller invokes `pingcode_list_requirements`
- **THEN** the server filters work items by the configured requirement work item type.
- **AND** returns rich-text image metadata such as image count and source URLs.

#### Scenario: List my defects

- **WHEN** the caller invokes `pingcode_list_my_bugs`
- **AND** `PINGCODE_DEFAULT_ASSIGNEE_NAME` is configured
- **THEN** the server filters defects by that assignee display name.

#### Scenario: List my requirements

- **WHEN** the caller invokes `pingcode_list_my_requirements`
- **AND** `PINGCODE_DEFAULT_ASSIGNEE_NAME` is configured
- **THEN** the server filters requirements by that assignee display name.

### Requirement: Spreadsheet Import

The MCP server SHALL import PingCode defects and requirements from `.xlsx` or `.csv` files using the screenshot table headers.

#### Scenario: Dry-run import

- **WHEN** the caller invokes an import tool without `dryRun=false`
- **THEN** the server returns planned create/update operations only.

#### Scenario: Execute import

- **WHEN** the caller invokes an import tool with `dryRun=false`
- **THEN** the server creates or updates work items via PingCode APIs.

### Requirement: Status Update

The MCP server SHALL update one defect or requirement status by identifier or work item ID.

The MCP server SHALL provide a fix workflow tool for marking multiple defects fixed after code changes.

The MCP server SHALL provide comment tools for listing and creating work item comments.

#### Scenario: Update by identifier

- **WHEN** the caller passes `identifier=<PROJECT_KEY>-455` and `statusName=挂起`
- **THEN** the server resolves the work item and state ID
- **AND** sends a PingCode PATCH request with `state_id`.

#### Scenario: Mark fixed defects

- **WHEN** the caller invokes `pingcode_mark_bugs_fixed` with defect identifiers
- **THEN** the server plans updates from `新提交` to `已修复` by default
- **AND** skips defects whose current status is no longer `新提交`
- **AND** only sends PingCode PATCH requests when `dryRun=false`
- **AND** appends the provided comment to successfully updated defects when `comment` is set.

#### Scenario: Add work item comment

- **WHEN** the caller invokes `pingcode_add_work_item_comment` with `identifier=<PROJECT_KEY>-505`
- **THEN** the server resolves the work item ID
- **AND** returns a dry-run plan by default
- **AND** creates a PingCode comment only when `dryRun=false`.

#### Scenario: List work item comments

- **WHEN** the caller invokes `pingcode_list_work_item_comments` with `identifier=<PROJECT_KEY>-505`
- **THEN** the server resolves the work item ID
- **AND** returns comments bound to `principal_type=work_item`.

### Requirement: Secret Safety

The MCP server SHALL read `client_id`, `client_secret`, and tokens from environment variables only and SHALL NOT print or return secret values.

#### Scenario: Client Credentials authentication

- **WHEN** `PINGCODE_ACCESS_TOKEN` is not configured
- **AND** `PINGCODE_CLIENT_ID` and `PINGCODE_CLIENT_SECRET` are configured
- **THEN** the server obtains an Open API access token with the PingCode Client Credentials flow
- **AND** caches the authorization header until shortly before token expiry.

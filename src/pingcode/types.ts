export interface PageResponse<T> {
  page_size: number;
  page_index: number;
  total: number;
  values: T[];
}

export interface PingCodeRef {
  id: string;
  url?: string;
  name?: string;
  display_name?: string;
  type?: string;
  color?: string;
}

export interface PingCodeProject {
  id: string;
  url?: string;
  name: string;
  identifier?: string;
  type?: string;
}

export interface PingCodeTeam {
  id: string;
  name?: string;
  [k: string]: unknown;
}

export interface PingCodeUser {
  id: string;
  name?: string;
  display_name?: string;
  email?: string;
  [k: string]: unknown;
}

export interface WorkItemType {
  id: string;
  url?: string;
  name: string;
  group?: string;
}

export interface WorkItemState {
  id: string;
  url?: string;
  name: string;
  type?: string;
  color?: string;
}

export interface WorkItemPriority {
  id: string;
  url?: string;
  name: string;
}

export interface ProjectMember {
  id: string;
  type?: string;
  user?: PingCodeRef;
  name?: string;
  display_name?: string;
}

export interface PingCodeComment {
  id: string;
  url?: string;
  content?: string;
  is_deleted?: number | boolean;
  is_reply_comment?: boolean;
  replied_comment?: {
    id: string;
    url?: string;
    content?: string;
    is_deleted?: number | boolean;
  };
  created_at?: number;
  created_by?: PingCodeRef;
  updated_at?: number;
  updated_by?: PingCodeRef;
}

export interface WorkItem {
  id: string;
  url?: string;
  html_url?: string;
  identifier?: string;
  title?: string;
  description?: string;
  type?: WorkItemType | PingCodeRef;
  state?: WorkItemState | PingCodeRef;
  priority?: WorkItemPriority | PingCodeRef;
  assignee?: PingCodeRef;
  parent?: PingCodeRef;
  created_at?: number;
  updated_at?: number;
  properties?: Record<string, unknown>;
  public_image_token?: string | null;
}

export interface WorkItemPayload {
  project_id?: string;
  type_id?: string;
  title?: string;
  description?: string;
  state_id?: string;
  priority_id?: string;
  assignee_id?: string;
  parent_id?: string;
  properties?: Record<string, unknown>;
}

export interface BulkUpdatePayload {
  ids: string[];
  property_name: string;
  property_value: string;
}

export interface WorkItemStatePlan {
  id: string;
  name?: string;
  project_type?: string;
  work_item_type?: string;
}

export interface WorkItemStateFlow {
  id?: string;
  from_state_id?: string;
  to_state_id?: string;
  to_state?: { id: string; name?: string };
}

export interface WorkItemListQuery {
  identifier?: string;
  project_ids?: string;
  type_ids?: string;
  state_ids?: string;
  assignee_ids?: string;
  priority_ids?: string;
  parent_ids?: string;
  tag_ids?: string;
  sprint_ids?: string;
  board_ids?: string;
  entry_ids?: string;
  swimlane_ids?: string;
  phase_ids?: string;
  version_ids?: string;
  created_by_ids?: string;
  participant_id?: string;
  keywords?: string;
  updated_between?: string;
  created_between?: string;
  start_between?: string;
  end_between?: string;
  include_deleted?: boolean;
  include_archived?: boolean;
  include_public_image_token?: boolean;
  page_index?: number;
  page_size?: number;
}

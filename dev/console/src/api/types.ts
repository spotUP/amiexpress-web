export interface NodeStatus {
  nodeId: number;
  online: boolean;
  userId?: string;
  username?: string;
  location?: string;
  state?: string;
  currentActivity?: string;
  connectionType?: string;
  lastActivity?: string;
  timeRemaining?: number;
}

export interface UserRecord {
  id?: string;
  username: string;
  realname?: string;
  location?: string;
  secLevel?: number;
  seclevel?: number;
  calls?: number;
  lastOn?: string;
  lastLogin?: string;
  uploads?: number;
  downloads?: number;
  flags?: number;
}

export interface ConferenceConfig {
  id: number;
  conference_id: number;
  name: string;
  ndirs: number;
  [key: string]: unknown;
}

export interface CallerRecord {
  id: number;
  nodeId: number;
  userId: string;
  username: string;
  action: string;
  details?: string;
  location: string;
  timestamp: string;
}

export interface SystemStats {
  allTime: {
    totalUsers: number;
    totalMessages: number;
    totalFiles: number;
    totalBytes: number;
    totalDownloads: number;
    totalCalls: number;
  };
  today: {
    calls: number;
    activeUsers: number;
  };
}

export interface LogResponse {
  lines: string[];
  totalLines: number;
  logFile?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface AuthResponse {
  token: string;
  user: { id: string; username: string; secLevel: number };
}

export interface DoorInfo {
  id: string | number;
  door_name: string;
  door_command?: string;
  door_type: string;
  door_path?: string;
  enabled: boolean;
  description?: string;
}

export interface ConferenceHealth {
  conferenceId: number;
  name: string;
  healthy: boolean;
  issues: string[];
  fixable: boolean;
}

export interface SystemConfig {
  bbs_name: string;
  sysop_name: string;
  max_nodes: number;
  new_user_sec_level: number;
  telnet_port: number;
  ssh_port?: number;
  [key: string]: unknown;
}

// Phase C: CRUD pages — types mirror the backend SQL columns directly.
export interface LanguageRow {
  id: number;
  language_number: number;
  title: string;
  language_code?: string;
  file_path?: string;
  enabled: boolean;
}
export interface ProtocolRow {
  id: number;
  protocol_name: string;
  protocol_code?: string;
  command?: string;
  upload_command?: string;
  download_command?: string;
  batch_upload?: boolean;
  batch_download?: boolean;
  bidirectional?: boolean;
  enabled: boolean;
  is_default?: boolean;
}
export interface ComputerRow {
  id: number;
  computer_number: number;
  computer_name: string;
  enabled: boolean;
}
export interface ScreenTypeRow {
  id: number;
  screen_number: number;
  screen_type: string;
  screen_title?: string;
  enabled: boolean;
}
export interface DriveRow {
  id: number;
  drive_number: number;
  drive_path: string;
  enabled: boolean;
}
export interface FileCheckerRow {
  id: number;
  checker_name: string;
  checker_path?: string;
  options?: string;
  stack_size?: number;
  priority?: number;
  script_path?: string;
  enabled: boolean;
}
export interface SecurityRow {
  id: number;
  security_level: number;
  acs_flag: string;
  enabled: boolean;
  description?: string;
}

// Import/Export types (mirrors web admin)
export interface ImportValidation {
  users?: { errors?: string[]; warnings?: string[] };
  conferences?: { errors?: string[]; warnings?: string[] };
  commands?: { errors?: string[]; warnings?: string[] };
  [key: string]: { errors?: string[]; warnings?: string[] } | undefined;
}

export interface ImportConflict {
  import: Record<string, unknown>;
  existing: Record<string, unknown>;
}

export interface ImportConflicts {
  userConflicts?: ImportConflict[];
  conferenceConflicts?: ImportConflict[];
  commandConflicts?: ImportConflict[];
  recommendations?: string[];
}

export interface ImportSummary {
  users: number;
  conferences: number;
  commands: number;
  nodes: number;
}

export interface ValidationResult {
  success: boolean;
  valid: boolean;
  validation: ImportValidation;
  conflicts: ImportConflicts;
  summary: ImportSummary;
}

export interface ImportResult {
  success: boolean;
  usersImported: number;
  conferencesImported: number;
  commandsImported: number;
  errors: string[];
  warnings: string[];
}

export interface ImportProgress {
  id: string;
  status: string;
  progress: number;
  message?: string;
}

// ───── Web config-app parity types ──────────────────────────────

// User types - matches web's User interface
export interface User {
  id: number | string;
  username: string;
  email?: string;
  secLevel: number;
  realname?: string;
  location?: string;
  calls?: number;
  lastOn?: string;
  lastLogin?: string;
  uploads?: number;
  downloads?: number;
  flags?: number;
  expert?: string;
  ansi?: boolean;
  created_at?: string;
  password?: string;
  new_password?: string;
}

// Door types - matches web's Door
export interface Door {
  id: number;
  door_name: string;
  door_command: string;
  door_type: 'SYSCMD' | 'BBSCMD' | 'INTERNAL' | string;
  door_path?: string;
  door_args?: string;
  working_directory?: string;
  priority?: string;
  door_options?: string[];
  runtime_env?: 'AMIGA_68K' | 'NATIVE_NODE' | 'BROWSER' | string;
  min_security_level?: number;
  max_security_level?: number;
  required_flags?: string;
  time_limit?: number;
  memory_limit?: number;
  title?: string;
  description?: string;
  category?: string;
  enabled: boolean;
  access_level?: number;
  archive_name?: string;
  created_at?: string;
  updated_at?: string;
  // Legacy fields the TUI's old DoorsTab used
  size?: number;
  name?: string;
}

// Node configuration (separate from live node control)
export interface NodeConfig {
  id: number;
  node_number: number;
  node_start?: string;
  priority?: number;
  capitol_files?: boolean;
  telnet?: boolean;
  ftp?: boolean;
  sysop_chat_color?: number;
  user_chat_color?: number;
  nrams?: string[];
  created_at?: string;
  updated_at?: string;
}

// Conference configuration - matches web's ConferenceConfig
export interface ConferenceConfigFull {
  id: number;
  conference_id: number;
  name: string;
  ndirs?: number;
  dlpath_1?: string;
  dlpath_2?: string;
  dlpath_3?: string;
  dlpath_4?: string;
  dlpath_5?: string;
  dlpath_6?: string;
  dlpath_7?: string;
  dlpath_8?: string;
  dlpath_9?: string;
  dlpath_10?: string;
  dlpath_11?: string;
  dlpath_12?: string;
  dlpath_13?: string;
  dlpath_14?: string;
  dlpath_15?: string;
  dlpath_16?: string;
  ulpath_1?: string;
  ulpath_2?: string;
  ulpath_3?: string;
  ulpath_4?: string;
  ulpath_5?: string;
  ulpath_6?: string;
  ulpath_7?: string;
  ulpath_8?: string;
  ulpath_9?: string;
  ulpath_10?: string;
  ulpath_11?: string;
  ulpath_12?: string;
  ulpath_13?: string;
  ulpath_14?: string;
  ulpath_15?: string;
  ulpath_16?: string;
  force_newscan?: boolean;
  exclude_ftp?: boolean;
  private_conf?: boolean;
  read_only?: boolean;
  min_access_level?: number;
  max_access_level?: number;
  created_at?: string;
  updated_at?: string;
}

// ACS (Access Control System) - the web's Security page uses these
export interface AcsLevel {
  level: number;
  description?: string;
  flag_count?: number;
}

export interface AcsLevelFlag {
  flag: string;
  value: boolean;
  description?: string;
}

export interface SecurityAccess {
  id: number;
  security_level: number;
  acs_flag: string;
  enabled: boolean;
  description?: string;
}

// File checker errors
export interface FileCheckerError {
  id: number;
  checker_id: number;
  exit_code?: number;
  regex?: string;
  message?: string;
  enabled?: boolean;
  created_at?: string;
}

// Operator chat config
export interface OperatorChatConfig {
  page_timeout_seconds?: number;
  cooldown_seconds?: number;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  discord_webhook_url?: string;
  quick_replies?: string[];
  [key: string]: unknown;
}

// Global wall config (separate from comments)
export interface GlobalWallConfig {
  enabled?: boolean;
  max_message_length?: number;
  profanity_filter?: boolean;
  auto_moderation?: boolean;
  [key: string]: unknown;
}

// Session log types - matches web's SessionInfo
export interface SessionInfoFull {
  sessionId: string;
  userId?: string;
  username?: string;
  nodeId?: number;
  startTime: string;
  lastActivity: string;
  lineCount: number;
  active?: boolean;
}

export interface SessionLogFull {
  sessionId: string;
  userId?: string;
  username?: string;
  nodeId?: number;
  startTime: string;
  lastActivity: string;
  output: string[];
}

// Batch types
export interface BatchSummary {
  name: string;
  size?: number;
  modified?: string;
}

// SSH key info
export interface SSHKeyInfo {
  exists: boolean;
  fingerprint?: string;
  keySize?: number;
  createdAt?: string;
  path?: string;
}

// Stats response
export interface StatisticsData {
  allTime: {
    totalUsers: number;
    totalMessages: number;
    totalFiles: number;
    totalBytes: number;
    totalDownloads: number;
    totalCalls: number;
  };
  today: {
    calls: number;
    activeUsers: number;
  };
}

// System config (full version matching web)
export interface SystemConfigFull {
  id?: number;
  bbs_name?: string;
  sysop_name?: string;
  location?: string;
  phone?: string;
  email?: string;
  website?: string;
  min_password_length?: number;
  min_password_strength?: number;
  max_password_fails?: number;
  new_user_sec_level?: number;
  new_user_time_limit?: number;
  new_user_chat_limit?: number;
  new_user_lines_per_screen?: number;
  new_user_expert?: boolean;
  new_user_ansi?: boolean;
  new_user_protocol?: string;
  new_user_screen_type?: string;
  new_user_editor?: string;
  ansi_enabled?: boolean;
  color_scheme?: string;
  language_base?: string;
  default_language?: string;
  max_conferences?: number;
  max_message_bases?: number;
  max_file_areas?: number;
  max_nodes?: number;
  file_check_enabled?: boolean;
  upload_check_virus?: boolean;
  upload_check_dupe?: boolean;
  allow_internet_email?: boolean;
  smtp_server?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_ssl?: boolean;
  smtp_from_email?: string;
  sysop_email?: string;
  bbs_email?: string;
  telnet_port?: number;
  ssh_port?: number;
  quiet_join?: boolean;
  reg_key?: string;
  debug_mode?: boolean;
  log_level?: string;
  log_retention_days?: number;
  sysop_debug_enabled?: boolean;
  mail_on_upload?: boolean;
  mail_on_sysop_comment?: boolean;
  mail_on_logon?: boolean;
  mail_on_new_user?: boolean;
  mail_on_logoff?: boolean;
  mail_on_sysop_page?: boolean;
  mail_on_pwd_fail?: boolean;
  autoval_delay?: number;
  autoval_preset?: string;
  autoval_password?: string;
  password_expiry_days?: number;
  auto_deactivate_days?: number;
  filediz_syscmd?: string;
  max_desclines?: number;
  hold_access_level?: number;
  local_upload_path?: string;
  ftp_enabled?: boolean;
  ftp_host?: string;
  ftp_port?: number;
  ftp_data_ports?: string;
  http_enabled?: boolean;
  http_host?: string;
  http_port?: number;
  strict_password_policy?: boolean;
  auto_validate?: boolean;
  confirm_deletions?: boolean;
  password_security?: string;
  default_time_limit?: number;
  max_session_time?: number;
  idle_timeout?: number;
  new_user_conf_access?: string;
  new_user_available_chat?: boolean;
  new_user_quiet_node?: boolean;
  new_user_auto_rejoin?: boolean;
  allow_custom_screens?: boolean;
  convert_to_mb?: boolean;
  system_password?: string;
  cors_origins?: string;
  [key: string]: unknown;
}

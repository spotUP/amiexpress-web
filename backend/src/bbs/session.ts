/**
 * Session management and types
 * Extracted from index.ts for better modularity
 */

// BBS State definitions (mirroring AmiExpress state machine)
export enum BBSState {
  AWAIT = 'await',
  GRAPHICS_SELECT = 'graphics_select',
  LOGON = 'logon',
  NEW_USER_SIGNUP = 'new_user_signup',
  LOGGEDON = 'loggedon'
}

// New user signup substates (express.e:30128-30320)
export enum NewUserSubState {
  ENTER_NAME = 'enter_name',
  ENTER_LOCATION = 'enter_location',
  ENTER_PHONE = 'enter_phone',
  ENTER_EMAIL = 'enter_email',
  ENTER_PASSWORD = 'enter_password',
  CONFIRM_PASSWORD = 'confirm_password',
  SCREEN_LINES = 'screen_lines',
  COMPUTER_TYPE = 'computer_type',
  SCREEN_CLEAR = 'screen_clear',
  CONFIRM_INFO = 'confirm_info'
}

export enum LoggedOnSubState {
  DISPLAY_TITLE = 'display_title',
  DISPLAY_LOGON = 'display_logon',
  DISPLAY_BULL = 'display_bull',
  DISPLAY_NODE_BULL = 'display_node_bull',
  MAILSCAN = 'mailscan',
  CONF_SCAN = 'conf_scan',
  DISPLAY_CONF_BULL = 'display_conf_bull',
  DISPLAY_MENU = 'display_menu',
  READ_COMMAND = 'read_command',
  READ_SHORTCUTS = 'read_shortcuts',
  PROCESS_COMMAND = 'process_command',
  WAITING = 'waiting',

  // File operations
  FILES_MAIN = 'files_main',
  FILES_LIST_AREAS = 'files_list_areas',
  FILES_SELECT_AREA = 'files_select_area',
  FILES_SELECT_DIRECTORIES = 'files_select_directories',
  FILES_VIEW_AREA = 'files_view_area',
  FILES_DOWNLOAD = 'files_download',
  FILES_UPLOAD = 'files_upload',
  FILES_MAINTENANCE = 'files_maintenance',
  FILES_MAINT_SELECT = 'files_maint_select',
  FILES_MAINT_AREA_SELECT = 'files_maint_area_select',
  FILES_DELETE = 'files_delete',
  FILES_DELETE_CONFIRM = 'files_delete_confirm',
  FILES_MOVE = 'files_move',
  FILES_MOVE_DEST = 'files_move_dest',
  FILES_MOVE_CONFIRM = 'files_move_confirm',
  FILES_EDIT = 'files_edit',
  FILES_EDIT_SELECT = 'files_edit_select',
  FILE_AREA_SELECT = 'file_area_select',
  FILE_DIR_SELECT = 'file_dir_select',
  FILE_LIST = 'file_list',
  FILE_LIST_CONTINUE = 'file_list_continue',

  // Message operations
  READ_MESSAGES = 'read_messages',
  POST_MESSAGE = 'post_message',
  POST_MESSAGE_SUBJECT = 'post_message_subject',
  POST_MESSAGE_TO = 'post_message_to',
  POST_MESSAGE_BODY = 'post_message_body',

  // Door operations
  DOOR_SELECT = 'door_select',
  DOOR_RUNNING = 'door_running',
  DOOR_MANAGER = 'door_manager', // Sysop door management

  // Account operations
  ACCOUNT_MENU = 'account_menu',
  ACCOUNT_CHANGE_PASSWORD = 'account_change_password',
  ACCOUNT_CHANGE_PASSWORD_NEW = 'account_change_password_new',
  ACCOUNT_CHANGE_PASSWORD_CONFIRM = 'account_change_password_confirm',
  ACCOUNT_EDIT_SETTINGS = 'account_edit_settings',
  ACCOUNT_VIEW_STATS = 'account_view_stats',

  // Chat operations
  CHAT_PAGE_SYSOP = 'chat_page_sysop',
  CHAT_SESSION = 'chat_session',
  CHAT = 'chat', // Internode chat mode

  // Conference operations
  CONFERENCE_SELECT = 'conference_select',
  CONFERENCE_JOIN = 'conference_join',

  // Bulletin operations
  BULLETIN_SELECT = 'bulletin_select'
}

export interface BBSSession {
  state: BBSState;
  subState?: LoggedOnSubState;
  user?: any; // Will be User from database
  nodeNumber?: number; // Node number for multi-node BBS (like AmiExpress nodeNumber)
  currentConf: number;
  currentMsgBase: number;
  timeRemaining: number;
  timeLimit: number; // Time limit in seconds (like AmiExpress timeLimit)
  lastActivity: number;
  confRJoin: number; // Default conference to join (from user preferences)
  msgBaseRJoin: number; // Default message base to join
  commandBuffer: string; // Buffer for command input
  commandText?: string; // Current command text for PROCESS_COMMAND state (express.e:28639)
  menuPause: boolean; // Like AmiExpress menuPause - controls if menu displays immediately
  messageSubject?: string; // For message posting workflow
  messageBody?: string; // For message posting workflow
  messageRecipient?: string; // For private message recipient
  inputBuffer: string; // Buffer for line-based input (like login system)
  relConfNum: number; // Relative conference number (like AmiExpress relConfNum)
  currentConfName: string; // Current conference name (like AmiExpress currentConfName)
  cmdShortcuts: boolean; // Like AmiExpress cmdShortcuts - controls hotkey vs line input mode
  doorExpertMode?: boolean; // Like AmiExpress doorExpertMode - express.e:28583 - door can force menu display
  tempData?: any; // Temporary data storage for complex operations (like file listing)
  
  // Graphics mode settings (express.e:29536-29545)
  ansiMode?: boolean; // ANSI graphics mode enabled
  ripMode?: boolean; // RIP graphics mode enabled
  quickLogon?: boolean; // Quick logon flag
  
  // Login tracking (express.e:29140-29220, 29627-29641)
  loginRetries?: number; // Number of login attempts (max 5 for username, 3 for password)
  passwordRetries?: number; // Number of password attempts (max 3)
  attemptedUsername?: string; // Username being attempted for login
  loginTime?: number; // Login timestamp for session time tracking
  nodeStartTime?: number; // Node start time for uptime display
  
  // Security/ACS System (express.e:165-167, 306-308)
  acsLevel?: number; // Current ACS level (0-255, or -1 if invalid) - express.e:165
  securityFlags?: string; // Temporary per-session ACS overrides ("T"/"F"/"?") - express.e:306
  secOverride?: string; // Permanent override denials ("T"=deny) - strongest denial - express.e:307
  overrideDefaultAccess?: boolean; // Whether to skip default access checks - express.e:166
  userSpecificAccess?: boolean; // Whether user has specific access file - express.e:167
  currentStat?: number; // Current environment status (what user is doing) - express.e:308
  quietFlag?: boolean; // Whether node is in quiet mode (invisible to WHO) - express.e:309
  blockOLM?: boolean; // Whether to block Online Messages (OLM) - express.e:310
  
  // Message Pointer System (express.e:199-200, 4882-4973)
  lastMsgReadConf?: number; // Last message manually read (confBase.confYM) - express.e:199
  lastNewReadConf?: number; // Last message auto-scanned (confBase.confRead) - express.e:200
  
  // New user signup tracking (express.e:30128-30320)
  newUserSubState?: string; // Current step in new user signup flow
  signupData?: {
    username: string;
    password: string;
    location: string;
    phone: string;
    email: string;
  };
  
  // Internode chat fields
  chatSessionId?: string; // Current chat session ID (if in chat)
  chatWithUserId?: string; // User ID of chat partner
  chatWithUsername?: string; // Username of chat partner
  previousState?: BBSState; // State to return to after chat
  previousSubState?: LoggedOnSubState; // Substate to return to after chat
  // Multinode/chat room fields
  currentRoomId?: string; // Current chat room ID
  sysopChatSessionId?: string; // Sysop chat session ID
}

// Conference and Message Base data structures (simplified)
export interface Conference {
  id: number;
  name: string;
  description: string;
}

export interface MessageBase {
  id: number;
  name: string;
  conferenceId: number;
}

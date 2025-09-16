export enum AuditAction {
  // Authentication actions
  LOGIN = 'login',
  LOGOUT = 'logout',
  SIGNUP = 'signup',
  PASSWORD_RESET = 'password_reset',
  API_KEY_GENERATED = 'api_key_generated',
  API_KEY_REGENERATED = 'api_key_regenerated',
  API_KEY_REVOKED = 'api_key_revoked',
  MAGIC_LINK_SENT = 'magic_link_sent',
  MAGIC_LINK_USED = 'magic_link_used',

  // Project actions
  PROJECT_CREATED = 'project_created',
  PROJECT_UPDATED = 'project_updated',
  PROJECT_DELETED = 'project_deleted',
  PROJECT_SYNCED = 'project_synced',
  PROJECT_PUBLISHED = 'project_published',
  PROJECT_UNPUBLISHED = 'project_unpublished',

  // Profile actions
  PROFILE_CREATED = 'profile_created',
  PROFILE_UPDATED = 'profile_updated',
  PROFILE_VIEWED = 'profile_viewed',
  PROFILE_MADE_PUBLIC = 'profile_made_public',
  PROFILE_MADE_PRIVATE = 'profile_made_private',

  // Platform actions
  PLATFORM_CONNECTED = 'platform_connected',
  PLATFORM_DISCONNECTED = 'platform_disconnected',
  PLATFORM_TOKEN_REFRESHED = 'platform_token_refreshed',

  // API actions
  API_CALL = 'api_call',
  RATE_LIMIT_HIT = 'rate_limit_hit',

  // System actions
  SYSTEM_ERROR = 'system_error',
  SECURITY_EVENT = 'security_event',
  DATA_EXPORT = 'data_export',
  DATA_IMPORT = 'data_import',
}

export enum AuditResource {
  USER = 'user',
  PROJECT = 'project',
  PROFILE = 'profile',
  API_KEY = 'api_key',
  PLATFORM_CONNECTION = 'platform_connection',
  SYNC_OPERATION = 'sync_operation',
  SYSTEM = 'system',
}

export interface AuditEventDetails {
  // Common fields
  [key: string]: any;

  // Specific detail types
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  changes?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  metadata?: Record<string, any>;
  reason?: string;
  source?: string;
}

export interface CreateAuditLogDto {
  userId?: string;
  action: AuditAction;
  resource?: AuditResource;
  resourceId?: string;
  details?: AuditEventDetails;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
  error?: string;
}

export interface AuditLogFilters {
  userId?: string;
  action?: AuditAction | AuditAction[];
  resource?: AuditResource | AuditResource[];
  resourceId?: string;
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
  ipAddress?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'timestamp' | 'action' | 'resource';
  orderDirection?: 'asc' | 'desc';
}

export interface AuditLogSummary {
  totalEvents: number;
  successfulEvents: number;
  failedEvents: number;
  uniqueUsers: number;
  topActions: Array<{
    action: AuditAction;
    count: number;
  }>;
  topResources: Array<{
    resource: AuditResource;
    count: number;
  }>;
  timeRange: {
    start: Date;
    end: Date;
  };
}

export interface AuditRetentionPolicy {
  retentionDays: number;
  archiveAfterDays?: number;
  compressionEnabled?: boolean;
  exportBeforeDelete?: boolean;
}

export interface SecurityEvent {
  type:
    | 'suspicious_login'
    | 'multiple_failed_attempts'
    | 'unusual_api_usage'
    | 'data_breach_attempt';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  indicators: Record<string, any>;
  recommendedActions?: string[];
}

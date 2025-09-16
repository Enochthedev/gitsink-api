// Custom metadata entry interface
export interface CustomMetadataEntry {
  id: string;
  projectId: string;
  userId: string;
  version: number;
  metadata: Record<string, any>;
  hash: string;
  size: number;
  fieldCount: number;
  createdAt: Date;
}

// Metadata version interface for history
export interface MetadataVersion {
  id: string;
  version: number;
  hash: string;
  size: number;
  fieldCount: number;
  createdAt: Date;
  userId: string;
}

// Metadata validation result
export interface MetadataValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Search options for metadata queries
export interface MetadataSearchOptions {
  field: string;
  value: any;
  operator?: 'equals' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'exists';
  dataType?: 'string' | 'number' | 'boolean' | 'array' | 'object';
}

// Metadata statistics
export interface MetadataStatistics {
  projectsWithMetadata: number;
  totalMetadataEntries: number;
  averageFieldCount: number;
  mostCommonFields: Array<{ field: string; count: number }>;
  averageSize: number;
  maxSize: number;
  minSize: number;
}

// Metadata API request/response types
export interface CreateMetadataRequest {
  projectId: string;
  metadata: Record<string, any>;
  version?: number;
}

export interface UpdateMetadataRequest {
  metadata: Record<string, any>;
  version?: number;
}

export interface MetadataResponse {
  success: boolean;
  data?: CustomMetadataEntry;
  error?: string;
  warnings?: string[];
}

export interface MetadataHistoryResponse {
  success: boolean;
  data?: MetadataVersion[];
  total?: number;
  error?: string;
}

export interface MetadataComparisonResponse {
  success: boolean;
  data?: {
    added: Record<string, any>;
    removed: Record<string, any>;
    modified: Record<string, { old: any; new: any }>;
  };
  error?: string;
}

export interface MetadataSearchResponse {
  success: boolean;
  data?: string[];
  total?: number;
  error?: string;
}

export interface MetadataStatisticsResponse {
  success: boolean;
  data?: MetadataStatistics;
  error?: string;
}

// Metadata field definition for schema validation
export interface MetadataFieldDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  description?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
    custom?: (value: any) => boolean;
  };
  examples?: any[];
}

// Metadata schema definition
export interface MetadataSchema {
  version: string;
  name: string;
  description?: string;
  fields: MetadataFieldDefinition[];
  createdAt: Date;
  updatedAt: Date;
}

// Metadata template for common use cases
export interface MetadataTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  schema: MetadataSchema;
  isPublic: boolean;
  usageCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Metadata export/import types
export interface MetadataExport {
  projectId: string;
  projectTitle: string;
  versions: Array<{
    version: number;
    metadata: Record<string, any>;
    createdAt: Date;
  }>;
  exportedAt: Date;
  exportedBy: string;
}

export interface MetadataImport {
  projectId: string;
  metadata: Record<string, any>;
  overwriteExisting?: boolean;
  preserveVersions?: boolean;
}

// Metadata migration types
export interface MetadataMigration {
  id: string;
  name: string;
  description: string;
  fromVersion: string;
  toVersion: string;
  transformFunction: (metadata: Record<string, any>) => Record<string, any>;
  createdAt: Date;
}

// Metadata audit log
export interface MetadataAuditLog {
  id: string;
  projectId: string;
  userId: string;
  action: 'create' | 'update' | 'delete' | 'restore';
  version: number;
  changes?: {
    added?: Record<string, any>;
    removed?: Record<string, any>;
    modified?: Record<string, { old: any; new: any }>;
  };
  timestamp: Date;
  userAgent?: string;
  ipAddress?: string;
}

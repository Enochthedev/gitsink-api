import { IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ArgsType, Field, InputType, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum ReportType {
  SECURITY = 'security',
  COMPLIANCE = 'compliance',
  ACTIVITY = 'activity',
  PERFORMANCE = 'performance',
}

export enum ExportFormat {
  JSON = 'json',
  CSV = 'csv',
  XLSX = 'xlsx',
}

// Register enums with GraphQL
registerEnumType(ReportType, {
  name: 'ReportType',
  description: 'The type of audit report to generate',
});

registerEnumType(ExportFormat, {
  name: 'ExportFormat',
  description: 'The format for exporting audit data',
});

@ArgsType()
export class GenerateReportArgs {
  @Field(() => ReportType)
  @IsEnum(ReportType)
  reportType!: ReportType;

  @Field()
  @IsDateString()
  startDate!: string;

  @Field()
  @IsDateString()
  endDate!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  userId?: string;
}

@ArgsType()
export class ExportAuditDataArgs {
  @Field(() => ExportFormat, { defaultValue: ExportFormat.JSON })
  @IsOptional()
  @IsEnum(ExportFormat)
  format?: ExportFormat = ExportFormat.JSON;

  @Field({ defaultValue: true })
  @IsOptional()
  @IsBoolean()
  includeMetadata?: boolean = true;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  userId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsString({ each: true })
  actions?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsString({ each: true })
  resources?: string[];
}

@ArgsType()
export class SearchAuditLogsArgs {
  @Field()
  @IsString()
  query!: string;

  @Field()
  @IsString()
  searchQuery!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  userId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @Field({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  limit?: number = 50;

  @Field({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  offset?: number = 0;
}

@ObjectType()
export class ReportSummary {
  @Field()
  totalSecurityEvents!: number;

  @Field()
  totalComplianceViolations!: number;

  @Field()
  totalUserActions!: number;

  @Field()
  reportGeneratedAt!: Date;

  @Field()
  reportPeriod!: string;

  @Field()
  criticalEvents!: number;

  @Field()
  highSeverityEvents!: number;

  @Field()
  mediumSeverityEvents!: number;

  @Field()
  lowSeverityEvents!: number;
}

@ObjectType()
export class FailedLoginAttempts {
  @Field()
  total!: number;

  @Field()
  uniqueUsers!: number;

  @Field(() => [TopFailedUser])
  topFailedUsers!: TopFailedUser[];
}

@ObjectType()
export class TopFailedUser {
  @Field()
  userId!: string;

  @Field({ nullable: true })
  username?: string;

  @Field()
  attempts!: number;
}

@ObjectType()
export class RateLimitViolations {
  @Field()
  total!: number;

  @Field()
  uniqueUsers!: number;

  @Field(() => [TopViolator])
  topViolators!: TopViolator[];
}

@ObjectType()
export class TopViolator {
  @Field()
  userId!: string;

  @Field({ nullable: true })
  username?: string;

  @Field()
  violations!: number;
}

@ObjectType()
export class SecurityReportEntity {
  @Field()
  reportId!: string;

  @Field()
  generatedAt!: Date;

  @Field()
  startDate!: Date;

  @Field()
  endDate!: Date;

  @Field(() => ReportSummary)
  summary!: ReportSummary;

  @Field(() => FailedLoginAttempts)
  failedLoginAttempts!: FailedLoginAttempts;

  @Field(() => RateLimitViolations)
  rateLimitViolations!: RateLimitViolations;

  @Field(() => [String])
  recommendations!: string[];
}

@ObjectType()
export class DataAccess {
  @Field()
  totalAccesses!: number;

  @Field()
  unauthorizedAttempts!: number;

  @Field()
  dataExports!: number;

  @Field()
  sensitiveDataAccess!: number;

  @Field()
  userDataAccesses!: number;

  @Field()
  adminDataAccesses!: number;

  @Field()
  exportOperations!: number;
}

@ObjectType()
export class UserActions {
  @Field()
  accountCreations!: number;

  @Field()
  accountDeletions!: number;

  @Field()
  permissionChanges!: number;

  @Field()
  passwordResets!: number;

  @Field()
  profileUpdates!: number;

  @Field()
  dataExports!: number;
}

@ObjectType()
export class SystemChanges {
  @Field()
  configurationChanges!: number;

  @Field()
  securityPolicyUpdates!: number;

  @Field()
  securityPolicyChanges!: number;

  @Field()
  systemUpdates!: number;

  @Field()
  userPermissionChanges!: number;
}

@ObjectType()
export class AuditTrailIntegrity {
  @Field()
  totalRecords!: number;

  @Field()
  integrityChecks!: number;

  @Field()
  anomaliesDetected!: number;
}

@ObjectType()
export class ComplianceReportEntity {
  @Field()
  reportId!: string;

  @Field()
  generatedAt!: Date;

  @Field()
  startDate!: Date;

  @Field()
  endDate!: Date;

  @Field(() => ReportSummary)
  summary!: ReportSummary;

  @Field(() => DataAccess)
  dataAccess!: DataAccess;

  @Field(() => UserActions)
  userActions!: UserActions;

  @Field(() => SystemChanges)
  systemChanges!: SystemChanges;

  @Field(() => AuditTrailIntegrity)
  auditTrailIntegrity!: AuditTrailIntegrity;
}

@ObjectType()
export class TopActiveUser {
  @Field()
  userId!: string;

  @Field({ nullable: true })
  username?: string;

  @Field()
  actionCount!: number;
}

@ObjectType()
export class UserActivityStats {
  @Field()
  totalUsers!: number;

  @Field()
  activeUsers!: number;

  @Field()
  newUsers!: number;

  @Field(() => [TopActiveUser])
  topActiveUsers!: TopActiveUser[];
}

@ObjectType()
export class ProjectActivityStats {
  @Field()
  totalProjects!: number;

  @Field()
  activeProjects!: number;

  @Field()
  newProjects!: number;

  @Field()
  syncedProjects!: number;
}

@ObjectType()
export class PlatformActivityStats {
  @Field()
  totalConnections!: number;

  @Field()
  uniquePlatforms!: number;

  @Field()
  newConnections!: number;
}

@ObjectType()
export class ApiUsageStats {
  @Field()
  totalCalls!: number;

  @Field()
  uniqueEndpoints!: number;

  @Field()
  uniqueUsers!: number;
}

@ObjectType()
export class ActivityReportEntity {
  @Field()
  reportId!: string;

  @Field()
  generatedAt!: Date;

  @Field()
  startDate!: Date;

  @Field()
  endDate!: Date;

  @Field(() => ReportSummary)
  summary!: ReportSummary;

  @Field(() => UserActivityStats)
  userActivity!: UserActivityStats;

  @Field(() => ProjectActivityStats)
  projectActivity!: ProjectActivityStats;

  @Field(() => PlatformActivityStats)
  platformActivity!: PlatformActivityStats;

  @Field(() => ApiUsageStats)
  apiUsage!: ApiUsageStats;
}

@ObjectType()
export class SyncPerformanceStats {
  @Field()
  totalOperations!: number;

  @Field()
  averageResponseTime!: number;

  @Field()
  averageDuration!: number;

  @Field()
  successRate!: number;
}

@ObjectType()
export class ApiPerformanceStats {
  @Field()
  totalRequests!: number;

  @Field()
  averageResponseTime!: number;

  @Field()
  errorRate!: number;
}

@ObjectType()
export class SystemHealthStats {
  @Field()
  uptime!: number;

  @Field()
  memoryUsage!: number;

  @Field()
  cpuUsage!: number;

  @Field()
  diskUsage!: number;

  @Field()
  activeConnections!: number;

  @Field()
  errorCount!: number;

  @Field()
  warningCount!: number;

  @Field()
  criticalIssues!: number;
}

@ObjectType()
export class PerformanceReportEntity {
  @Field()
  reportId!: string;

  @Field()
  generatedAt!: Date;

  @Field()
  startDate!: Date;

  @Field()
  endDate!: Date;

  @Field(() => ReportSummary)
  summary!: ReportSummary;

  @Field(() => SyncPerformanceStats)
  syncPerformance!: SyncPerformanceStats;

  @Field(() => ApiPerformanceStats)
  apiPerformance!: ApiPerformanceStats;

  @Field(() => SystemHealthStats)
  systemHealth!: SystemHealthStats;
}

@ObjectType()
export class ExportResult {
  @Field()
  success!: boolean;

  @Field({ nullable: true })
  downloadUrl?: string;

  @Field({ nullable: true })
  filename?: string;

  @Field({ nullable: true })
  contentType?: string;

  @Field({ nullable: true })
  data?: string;

  @Field({ nullable: true })
  error?: string;
}

@ObjectType()
export class SearchResult {
  @Field()
  success!: boolean;

  @Field(() => [String])
  results!: string[];

  @Field(() => [String])
  matchingLogIds!: string[];

  @Field()
  totalCount!: number;

  @Field(() => [String])
  searchTerms!: string[];

  @Field({ nullable: true })
  error?: string;
}

import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  Post,
  Query,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { EnhancedJwtGuard } from '../auth/enhanced-jwt.guard';
import { AuditLogQueryDto, CreateAuditLogInput } from './dto/audit-log.dto';
import { AuditAction, AuditResource } from './interfaces/audit.interface';

@ApiTags('audit')
@Controller('audit')
@UseGuards(EnhancedJwtGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @ApiOperation({ summary: 'Get audit logs with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'Audit logs retrieved successfully',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Filter by user ID',
  })
  @ApiQuery({
    name: 'actions',
    required: false,
    description: 'Filter by actions (comma-separated)',
  })
  @ApiQuery({
    name: 'resources',
    required: false,
    description: 'Filter by resources (comma-separated)',
  })
  @ApiQuery({
    name: 'resourceId',
    required: false,
    description: 'Filter by resource ID',
  })
  @ApiQuery({
    name: 'success',
    required: false,
    description: 'Filter by success status',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Filter by start date (ISO string)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Filter by end date (ISO string)',
  })
  @ApiQuery({
    name: 'ipAddress',
    required: false,
    description: 'Filter by IP address',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of records to return (max 1000)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Number of records to skip',
  })
  @ApiQuery({
    name: 'orderBy',
    required: false,
    description: 'Field to order by',
  })
  @ApiQuery({
    name: 'orderDirection',
    required: false,
    description: 'Order direction (asc/desc)',
  })
  async getAuditLogs(
    @Query(new ValidationPipe({ transform: true })) query: AuditLogQueryDto,
    @Request() req: any,
  ) {
    // Convert arrays to proper format
    const filters = {
      ...query,
      action: query.actions,
      resource: query.resources,
    };

    // Non-admin users can only see their own audit logs
    if (!req.user.isAdmin) {
      filters.userId = req.user.id;
    }

    return this.auditService.getAuditLogs(filters);
  }

  @Get('logs/user/:userId')
  @ApiOperation({ summary: 'Get audit logs for a specific user' })
  @ApiResponse({
    status: 200,
    description: 'User audit logs retrieved successfully',
  })
  async getUserAuditLogs(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Request() req: any,
  ) {
    // Users can only see their own audit logs unless they're admin
    const userId = req.user.isAdmin ? req.params.userId : req.user.id;
    return this.auditService.getUserAuditLogs(userId, limit, offset);
  }

  @Get('logs/resource/:resource/:resourceId')
  @ApiOperation({ summary: 'Get audit logs for a specific resource' })
  @ApiResponse({
    status: 200,
    description: 'Resource audit logs retrieved successfully',
  })
  async getResourceAuditLogs(
    @Query('resource') resource: AuditResource,
    @Query('resourceId') resourceId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Request() req: any,
  ) {
    // TODO: Add authorization check to ensure user can access this resource
    return this.auditService.getResourceAuditLogs(resource, resourceId, limit, offset);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get audit log summary with statistics' })
  @ApiResponse({
    status: 200,
    description: 'Audit summary retrieved successfully',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date for summary (ISO string)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date for summary (ISO string)',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'User ID for user-specific summary',
  })
  @ApiQuery({
    name: 'topLimit',
    required: false,
    description: 'Limit for top actions/resources',
  })
  async getAuditSummary(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('userId') userId?: string,
    @Query('topLimit', new DefaultValuePipe(10), ParseIntPipe)
    topLimit: number = 10,
  ) {
    // Non-admin users can only see their own summary
    const targetUserId = req.user.isAdmin ? userId : req.user.id;

    return this.auditService.getAuditSummary(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      targetUserId,
      topLimit,
    );
  }

  @Get('export')
  @ApiOperation({ summary: 'Export audit logs' })
  @ApiResponse({ status: 200, description: 'Audit logs exported successfully' })
  @ApiQuery({
    name: 'format',
    required: false,
    description: 'Export format (json/csv)',
  })
  async exportAuditLogs(
    @Query(new ValidationPipe({ transform: true })) query: AuditLogQueryDto,
    @Query('format') format: 'json' | 'csv' = 'json',
    @Request() req: any,
  ) {
    // Convert arrays to proper format
    const filters = {
      ...query,
      action: query.actions,
      resource: query.resources,
    };

    // Non-admin users can only export their own audit logs
    if (!req.user.isAdmin) {
      filters.userId = req.user.id;
    }

    const exportData = await this.auditService.exportAuditLogs(filters, format);

    return {
      format,
      data: exportData,
      exportedAt: new Date().toISOString(),
      recordCount: exportData.split('\n').length - 1, // Rough count for CSV, exact for JSON would need parsing
    };
  }

  @Post('log')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an audit log entry (admin only)' })
  @ApiResponse({ status: 201, description: 'Audit log created successfully' })
  async createAuditLog(@Body() createAuditLogDto: CreateAuditLogInput, @Request() req: any) {
    // Only admins can manually create audit logs
    if (!req.user.isAdmin) {
      throw new Error('Unauthorized: Only administrators can create audit logs');
    }

    await this.auditService.logEvent({
      ...createAuditLogDto,
      details: createAuditLogDto.details ? JSON.parse(createAuditLogDto.details) : undefined,
    });

    return { message: 'Audit log created successfully' };
  }

  @Get('security/suspicious-activity')
  @ApiOperation({ summary: 'Detect suspicious activity patterns' })
  @ApiResponse({
    status: 200,
    description: 'Suspicious activity analysis completed',
  })
  async detectSuspiciousActivity(@Request() req: any) {
    // Non-admin users can only check their own activity
    const userId = req.user.isAdmin ? undefined : req.user.id;
    return this.auditService.detectSuspiciousActivity(userId);
  }

  @Get('security/suspicious-activity/:userId')
  @ApiOperation({
    summary: 'Detect suspicious activity for a specific user (admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'User suspicious activity analysis completed',
  })
  async detectUserSuspiciousActivity(@Query('userId') userId: string, @Request() req: any) {
    // Only admins can check other users' suspicious activity
    if (!req.user.isAdmin) {
      throw new Error("Unauthorized: Only administrators can check other users' activity");
    }

    return this.auditService.detectSuspiciousActivity(userId);
  }
}

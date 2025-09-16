import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Res,
  ValidationPipe,
  InternalServerErrorException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditReportingService } from './audit-reporting.service';
import { EnhancedJwtGuard } from '../auth/enhanced-jwt.guard';
import {
  ReportType,
  ExportFormat,
  ExportAuditDataArgs,
  SearchAuditLogsArgs,
} from './dto/audit-reporting.dto';
import { AuditLogQueryDto } from './dto/audit-log.dto';

@ApiTags('audit-reporting')
@Controller('audit/reporting')
@UseGuards(EnhancedJwtGuard)
@ApiBearerAuth()
export class AuditReportingController {
  constructor(private readonly auditReportingService: AuditReportingService) {}

  @Get('security')
  @ApiOperation({ summary: 'Generate security report' })
  @ApiResponse({
    status: 200,
    description: 'Security report generated successfully',
  })
  @ApiQuery({
    name: 'startDate',
    description: 'Start date for report (ISO string)',
  })
  @ApiQuery({
    name: 'endDate',
    description: 'End date for report (ISO string)',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'User ID for user-specific report',
  })
  async generateSecurityReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    // Only admins can generate system-wide reports
    if (!req.user.isAdmin && userId && userId !== req.user.id) {
      throw new Error('Unauthorized: Only administrators can generate reports for other users');
    }

    const targetUserId = req.user.isAdmin ? userId : req.user.id;

    return this.auditReportingService.generateSecurityReport(
      new Date(startDate),
      new Date(endDate),
      targetUserId,
    );
  }

  @Get('compliance')
  @ApiOperation({ summary: 'Generate compliance report' })
  @ApiResponse({
    status: 200,
    description: 'Compliance report generated successfully',
  })
  @ApiQuery({
    name: 'startDate',
    description: 'Start date for report (ISO string)',
  })
  @ApiQuery({
    name: 'endDate',
    description: 'End date for report (ISO string)',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'User ID for user-specific report',
  })
  async generateComplianceReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    // Only admins can generate system-wide reports
    if (!req.user.isAdmin && userId && userId !== req.user.id) {
      throw new Error('Unauthorized: Only administrators can generate reports for other users');
    }

    const targetUserId = req.user.isAdmin ? userId : req.user.id;

    return this.auditReportingService.generateComplianceReport(
      new Date(startDate),
      new Date(endDate),
      targetUserId,
    );
  }

  @Get('activity')
  @ApiOperation({ summary: 'Generate activity report' })
  @ApiResponse({
    status: 200,
    description: 'Activity report generated successfully',
  })
  @ApiQuery({
    name: 'startDate',
    description: 'Start date for report (ISO string)',
  })
  @ApiQuery({
    name: 'endDate',
    description: 'End date for report (ISO string)',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'User ID for user-specific report',
  })
  async generateActivityReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    // Only admins can generate system-wide reports
    if (!req.user.isAdmin && userId && userId !== req.user.id) {
      throw new Error('Unauthorized: Only administrators can generate reports for other users');
    }

    const targetUserId = req.user.isAdmin ? userId : req.user.id;

    return this.auditReportingService.generateActivityReport(
      new Date(startDate),
      new Date(endDate),
      targetUserId,
    );
  }

  @Get('performance')
  @ApiOperation({ summary: 'Generate performance report' })
  @ApiResponse({
    status: 200,
    description: 'Performance report generated successfully',
  })
  @ApiQuery({
    name: 'startDate',
    description: 'Start date for report (ISO string)',
  })
  @ApiQuery({
    name: 'endDate',
    description: 'End date for report (ISO string)',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'User ID for user-specific report',
  })
  async generatePerformanceReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    // Only admins can generate system-wide reports
    if (!req.user.isAdmin && userId && userId !== req.user.id) {
      throw new Error('Unauthorized: Only administrators can generate reports for other users');
    }

    const targetUserId = req.user.isAdmin ? userId : req.user.id;

    return this.auditReportingService.generatePerformanceReport(
      new Date(startDate),
      new Date(endDate),
      targetUserId,
    );
  }

  @Get('export')
  @ApiOperation({ summary: 'Export audit data in various formats' })
  @ApiResponse({ status: 200, description: 'Audit data exported successfully' })
  @ApiQuery({
    name: 'format',
    required: false,
    description: 'Export format (json/csv/xlsx)',
  })
  @ApiQuery({
    name: 'includeMetadata',
    required: false,
    description: 'Include export metadata',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Filter by user ID',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date filter (ISO string)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date filter (ISO string)',
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
  async exportAuditData(
    @Query('format') format: ExportFormat = ExportFormat.JSON,
    @Query('includeMetadata') includeMetadata: boolean = true,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('actions') actions?: string,
    @Query('resources') resources?: string,
    @Request() req?: any,
    @Res() res?: Response,
  ) {
    // Non-admin users can only export their own data
    const targetUserId = req.user.isAdmin ? userId : req.user.id;

    const filters = {
      userId: targetUserId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      action: actions ? (actions.split(',') as any) : undefined,
      resource: resources ? (resources.split(',') as any) : undefined,
      limit: 10000, // Large limit for export
      offset: 0,
    };

    const exportResult = await this.auditReportingService.exportAuditData(
      filters,
      format,
      includeMetadata,
    );

    if (!res) {
      throw new InternalServerErrorException('Response object not available');
    }

    res.setHeader('Content-Type', exportResult.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);

    if (Buffer.isBuffer(exportResult.data)) {
      res.send(exportResult.data);
    } else {
      res.send(exportResult.data);
    }
  }

  @Get('search')
  @ApiOperation({ summary: 'Search audit logs with advanced filtering' })
  @ApiResponse({ status: 200, description: 'Audit logs searched successfully' })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Filter by user ID',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date filter (ISO string)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date filter (ISO string)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of results to return',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Number of results to skip',
  })
  async searchAuditLogs(
    @Query('q') searchQuery: string,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
    @Request() req?: any,
  ) {
    // Non-admin users can only search their own logs
    const targetUserId = req.user.isAdmin ? userId : req.user.id;

    const filters = {
      userId: targetUserId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit,
      offset,
    };

    return this.auditReportingService.searchAuditLogs(searchQuery, filters);
  }

  @Post('custom-report')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate custom report with specific filters' })
  @ApiResponse({
    status: 200,
    description: 'Custom report generated successfully',
  })
  async generateCustomReport(
    @Body(new ValidationPipe({ transform: true }))
    reportConfig: {
      reportType: ReportType;
      startDate: string;
      endDate: string;
      userId?: string;
      filters?: any;
      includeCharts?: boolean;
      includeRecommendations?: boolean;
    },
    @Request() req?: any,
  ) {
    // Only admins can generate system-wide reports
    if (!req.user.isAdmin && reportConfig.userId && reportConfig.userId !== req.user.id) {
      throw new Error('Unauthorized: Only administrators can generate reports for other users');
    }

    const targetUserId = req.user.isAdmin ? reportConfig.userId : req.user.id;

    switch (reportConfig.reportType) {
      case ReportType.SECURITY:
        return this.auditReportingService.generateSecurityReport(
          new Date(reportConfig.startDate),
          new Date(reportConfig.endDate),
          targetUserId,
        );

      case ReportType.COMPLIANCE:
        return this.auditReportingService.generateComplianceReport(
          new Date(reportConfig.startDate),
          new Date(reportConfig.endDate),
          targetUserId,
        );

      case ReportType.ACTIVITY:
        return this.auditReportingService.generateActivityReport(
          new Date(reportConfig.startDate),
          new Date(reportConfig.endDate),
          targetUserId,
        );

      case ReportType.PERFORMANCE:
        return this.auditReportingService.generatePerformanceReport(
          new Date(reportConfig.startDate),
          new Date(reportConfig.endDate),
          targetUserId,
        );

      default:
        throw new Error(`Unsupported report type: ${reportConfig.reportType}`);
    }
  }
}

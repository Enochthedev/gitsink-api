import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SyncHistoryService } from './sync-history.service';
import { EnhancedJwtGuard } from '../auth/enhanced-jwt.guard';
import {
  CompleteSyncOperationInput,
  FailSyncOperationInput,
  StartSyncOperationInput,
  SyncHistoryQueryDto,
} from './dto/sync-history.dto';

@ApiTags('sync-history')
@Controller('sync-history')
@UseGuards(EnhancedJwtGuard)
@ApiBearerAuth()
export class SyncHistoryController {
  constructor(private readonly syncHistoryService: SyncHistoryService) {}

  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start tracking a sync operation' })
  @ApiResponse({
    status: 201,
    description: 'Sync operation started successfully',
  })
  async startSyncOperation(@Body() startSyncDto: StartSyncOperationInput, @Request() req: any) {
    // Ensure user can only start sync operations for themselves unless admin
    if (!req.user.isAdmin && startSyncDto.userId !== req.user.id) {
      throw new Error('Unauthorized: Can only start sync operations for yourself');
    }

    const syncId = await this.syncHistoryService.startSyncOperation({
      userId: startSyncDto.userId,
      projectId: startSyncDto.projectId,
      operation: startSyncDto.operation,
      platform: startSyncDto.platform,
      repositoryUrl: startSyncDto.repositoryUrl,
      metadata: startSyncDto.metadata ? JSON.parse(startSyncDto.metadata) : undefined,
    });

    return { syncId, message: 'Sync operation started successfully' };
  }

  @Put('complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a sync operation as completed' })
  @ApiResponse({
    status: 200,
    description: 'Sync operation completed successfully',
  })
  async completeSyncOperation(
    @Body() completeSyncDto: CompleteSyncOperationInput,
    @Request() req: any,
  ) {
    // TODO: Add authorization check to ensure user owns this sync operation

    await this.syncHistoryService.completeSyncOperation(
      completeSyncDto.syncId,
      completeSyncDto.changes ? JSON.parse(completeSyncDto.changes) : undefined,
      completeSyncDto.metadata ? JSON.parse(completeSyncDto.metadata) : undefined,
    );

    return { message: 'Sync operation completed successfully' };
  }

  @Put('fail')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a sync operation as failed' })
  @ApiResponse({ status: 200, description: 'Sync operation marked as failed' })
  async failSyncOperation(@Body() failSyncDto: FailSyncOperationInput, @Request() req: any) {
    // TODO: Add authorization check to ensure user owns this sync operation

    await this.syncHistoryService.failSyncOperation(
      failSyncDto.syncId,
      failSyncDto.error,
      failSyncDto.metadata ? JSON.parse(failSyncDto.metadata) : undefined,
    );

    return { message: 'Sync operation marked as failed' };
  }

  @Get()
  @ApiOperation({ summary: 'Get sync history with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'Sync history retrieved successfully',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Filter by user ID',
  })
  @ApiQuery({
    name: 'projectId',
    required: false,
    description: 'Filter by project ID',
  })
  @ApiQuery({
    name: 'operations',
    required: false,
    description: 'Filter by operations (comma-separated)',
  })
  @ApiQuery({
    name: 'platforms',
    required: false,
    description: 'Filter by platforms (comma-separated)',
  })
  @ApiQuery({
    name: 'statuses',
    required: false,
    description: 'Filter by statuses (comma-separated)',
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
  async getSyncHistory(
    @Query(new ValidationPipe({ transform: true })) query: SyncHistoryQueryDto,
    @Request() req: any,
  ) {
    // Convert string arrays to proper arrays
    const filters = {
      ...query,
      operation: query.operations,
      platform: query.platforms,
      status: query.statuses,
    };

    // Non-admin users can only see their own sync history
    if (!req.user.isAdmin) {
      filters.userId = req.user.id;
    }

    return this.syncHistoryService.getSyncHistory(filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get sync history statistics' })
  @ApiResponse({
    status: 200,
    description: 'Sync history statistics retrieved successfully',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'User ID for user-specific stats',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date for stats (ISO string)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date for stats (ISO string)',
  })
  async getSyncHistoryStats(
    @Request() req: any,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // Non-admin users can only see their own stats
    const targetUserId = req.user.isAdmin ? userId : req.user.id;

    return this.syncHistoryService.getSyncHistoryStats(
      targetUserId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'Get sync history for a specific project' })
  @ApiResponse({
    status: 200,
    description: 'Project sync history retrieved successfully',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  async getProjectSyncHistory(
    @Param('projectId') projectId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Request() req: any,
  ) {
    // TODO: Add authorization check to ensure user owns this project or is admin

    return this.syncHistoryService.getProjectSyncHistory(projectId, limit, offset);
  }

  @Get('failures/analysis')
  @ApiOperation({ summary: 'Analyze sync failures to identify patterns' })
  @ApiResponse({ status: 200, description: 'Sync failure analysis completed' })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'User ID for user-specific analysis',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date for analysis (ISO string)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date for analysis (ISO string)',
  })
  async analyzeSyncFailures(
    @Request() req: any,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // Non-admin users can only analyze their own failures
    const targetUserId = req.user.isAdmin ? userId : req.user.id;

    return this.syncHistoryService.analyzeSyncFailures(
      targetUserId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('user/:userId')
  @ApiOperation({
    summary: 'Get sync history for a specific user (admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'User sync history retrieved successfully',
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  async getUserSyncHistory(
    @Param('userId') userId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Request() req: any,
  ) {
    // Only admins can view other users' sync history
    if (!req.user.isAdmin && userId !== req.user.id) {
      throw new Error("Unauthorized: Only administrators can view other users' sync history");
    }

    return this.syncHistoryService.getSyncHistory({
      userId,
      limit,
      offset,
      orderBy: 'startedAt',
      orderDirection: 'desc',
    });
  }
}

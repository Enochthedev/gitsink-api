import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpException,
  ParseIntPipe,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MetadataService } from './metadata.service';
import { EnhancedJwtGuard } from '../auth/enhanced-jwt.guard';
import {
  CreateMetadataRequest,
  UpdateMetadataRequest,
  MetadataResponse,
  MetadataHistoryResponse,
  MetadataComparisonResponse,
  MetadataSearchResponse,
  MetadataStatisticsResponse,
  MetadataSearchOptions,
} from './types/metadata.types';
import { RequestWithUser } from '../auth/request-with-user';

@ApiTags('metadata')
@Controller('metadata')
@UseGuards(EnhancedJwtGuard)
@ApiBearerAuth()
export class MetadataController {
  constructor(private readonly metadataService: MetadataService) {}

  @Post()
  @ApiOperation({ summary: 'Create or update custom metadata for a project' })
  @ApiResponse({ status: 201, description: 'Metadata created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid metadata or validation failed',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async createMetadata(
    @Body(ValidationPipe) createRequest: CreateMetadataRequest,
    @Request() req: RequestWithUser,
  ): Promise<MetadataResponse> {
    try {
      const metadata = await this.metadataService.storeCustomMetadata(
        createRequest.projectId,
        createRequest.metadata,
        req.user.id,
        createRequest.version,
      );

      return {
        success: true,
        data: metadata,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error:
            error instanceof Error
              ? error instanceof Error
                ? error.message
                : String(error)
              : 'Failed to create metadata',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Get custom metadata for a project' })
  @ApiQuery({ name: 'version', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Metadata retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Metadata not found' })
  async getMetadata(
    @Param('projectId') projectId: string,
    @Query('version', new ParseIntPipe({ optional: true })) version?: number,
  ): Promise<MetadataResponse> {
    try {
      const metadata = await this.metadataService.getCustomMetadata(projectId, version);

      if (!metadata) {
        throw new HttpException(
          {
            success: false,
            error: 'Metadata not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        success: true,
        data: metadata,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          error:
            error instanceof Error
              ? error instanceof Error
                ? error.message
                : String(error)
              : 'Failed to retrieve metadata',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':projectId')
  @ApiOperation({ summary: 'Update custom metadata for a project' })
  @ApiResponse({ status: 200, description: 'Metadata updated successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid metadata or validation failed',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async updateMetadata(
    @Param('projectId') projectId: string,
    @Body(ValidationPipe) updateRequest: UpdateMetadataRequest,
    @Request() req: RequestWithUser,
  ): Promise<MetadataResponse> {
    try {
      const metadata = await this.metadataService.storeCustomMetadata(
        projectId,
        updateRequest.metadata,
        req.user.id,
        updateRequest.version,
      );

      return {
        success: true,
        data: metadata,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error:
            error instanceof Error
              ? error instanceof Error
                ? error.message
                : String(error)
              : 'Failed to update metadata',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':projectId/history')
  @ApiOperation({ summary: 'Get metadata version history for a project' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Metadata history retrieved successfully',
  })
  async getMetadataHistory(
    @Param('projectId') projectId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
    @Query('offset', new ParseIntPipe({ optional: true })) offset: number = 0,
  ): Promise<MetadataHistoryResponse> {
    try {
      const history = await this.metadataService.getMetadataHistory(projectId, limit, offset);

      return {
        success: true,
        data: history,
        total: history.length,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error:
            error instanceof Error
              ? error instanceof Error
                ? error.message
                : String(error)
              : 'Failed to retrieve metadata history',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':projectId/compare/:version1/:version2')
  @ApiOperation({ summary: 'Compare two metadata versions' })
  @ApiResponse({
    status: 200,
    description: 'Metadata comparison completed successfully',
  })
  @ApiResponse({ status: 404, description: 'One or both versions not found' })
  async compareMetadataVersions(
    @Param('projectId') projectId: string,
    @Param('version1', ParseIntPipe) version1: number,
    @Param('version2', ParseIntPipe) version2: number,
  ): Promise<MetadataComparisonResponse> {
    try {
      const comparison = await this.metadataService.compareMetadataVersions(
        projectId,
        version1,
        version2,
      );

      return {
        success: true,
        data: comparison,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error:
            error instanceof Error
              ? error instanceof Error
                ? error.message
                : String(error)
              : 'Failed to compare metadata versions',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('search')
  @ApiOperation({ summary: 'Search projects by custom metadata' })
  @ApiResponse({ status: 200, description: 'Search completed successfully' })
  async searchByMetadata(
    @Body(ValidationPipe) searchOptions: MetadataSearchOptions,
    @Request() req: RequestWithUser,
  ): Promise<MetadataSearchResponse> {
    try {
      const projectIds = await this.metadataService.searchByMetadata(req.user.id, searchOptions);

      return {
        success: true,
        data: projectIds,
        total: projectIds.length,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error:
            error instanceof Error
              ? error instanceof Error
                ? error.message
                : String(error)
              : 'Failed to search metadata',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('statistics/user')
  @ApiOperation({ summary: 'Get metadata statistics for the current user' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getMetadataStatistics(
    @Request() req: RequestWithUser,
  ): Promise<MetadataStatisticsResponse> {
    try {
      const statistics = await this.metadataService.getMetadataStatistics(req.user.id);

      return {
        success: true,
        data: statistics,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error:
            error instanceof Error
              ? error instanceof Error
                ? error.message
                : String(error)
              : 'Failed to retrieve statistics',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':projectId/versions/:version')
  @ApiOperation({ summary: 'Delete a specific metadata version' })
  @ApiResponse({
    status: 200,
    description: 'Metadata version deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Version not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async deleteMetadataVersion(
    @Param('projectId') projectId: string,
    @Param('version', ParseIntPipe) version: number,
    @Request() req: RequestWithUser,
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.metadataService.deleteMetadataVersion(projectId, version, req.user.id);

      return {
        success: true,
        message: 'Metadata version deleted successfully',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error:
            error instanceof Error
              ? error instanceof Error
                ? error.message
                : String(error)
              : 'Failed to delete metadata version',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}

import { Controller, Get, HttpStatus, HttpException } from '@nestjs/common';
import { HealthService, SystemHealth } from './health.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) { }

  @Get()
  @ApiOperation({ summary: 'Basic health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async check() {
    try {
      const summary = await this.healthService.getHealthSummary();
      return {
        status: summary.status === 'healthy' ? 'ok' : summary.status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: summary,
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          message: 'Health check failed',
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('detailed')
  @ApiOperation({ summary: 'Detailed health check with all services' })
  @ApiResponse({ status: 200, description: 'Detailed health information' })
  async detailedCheck(): Promise<SystemHealth> {
    try {
      return await this.healthService.getOverallHealth();
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          message: 'Detailed health check failed',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('database')
  @ApiOperation({ summary: 'Database health check' })
  @ApiResponse({ status: 200, description: 'Database health status' })
  async checkDatabase() {
    try {
      const status = await this.healthService.checkDatabase();
      return {
        service: 'database',
        ...status,
      };
    } catch (error) {
      throw new HttpException(
        {
          service: 'database',
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('redis')
  @ApiOperation({ summary: 'Redis health check' })
  @ApiResponse({ status: 200, description: 'Redis health status' })
  async checkRedis() {
    try {
      const status = await this.healthService.checkRedis();
      return {
        service: 'redis',
        ...status,
      };
    } catch (error) {
      throw new HttpException(
        {
          service: 'redis',
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('queues')
  @ApiOperation({ summary: 'Queue health check' })
  @ApiResponse({ status: 200, description: 'Queue health status' })
  async checkQueues() {
    try {
      const status = await this.healthService.checkQueues();
      return {
        service: 'queues',
        ...status,
      };
    } catch (error) {
      throw new HttpException(
        {
          service: 'queues',
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('external')
  @ApiOperation({ summary: 'External services health check' })
  @ApiResponse({ status: 200, description: 'External services health status' })
  async checkExternalServices() {
    try {
      const services = await this.healthService.checkExternalServices();
      return {
        services,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          message: 'External services health check failed',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('metrics')
  @ApiOperation({ summary: 'System metrics' })
  @ApiResponse({ status: 200, description: 'Current system metrics' })
  async getMetrics() {
    try {
      const metrics = await this.healthService.getSystemMetrics();
      return {
        metrics,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          message: 'Failed to get system metrics',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('configuration')
  @ApiOperation({ summary: 'Configuration health check' })
  @ApiResponse({ status: 200, description: 'Configuration health status' })
  async checkConfiguration() {
    try {
      const status = await this.healthService.checkConfigurationHealth();
      return {
        service: 'configuration',
        ...status,
      };
    } catch (error) {
      throw new HttpException(
        {
          service: 'configuration',
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('scaling')
  @ApiOperation({ summary: 'Get scaling recommendation' })
  @ApiResponse({
    status: 200,
    description: 'Scaling recommendation based on current health',
  })
  async getScalingRecommendation() {
    try {
      const recommendation = await this.healthService.getScalingRecommendation();
      return {
        recommendation,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          message: 'Failed to get scaling recommendation',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

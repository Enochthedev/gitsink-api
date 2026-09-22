import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

@ApiTags('Metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  @ApiOperation({ summary: 'Get Prometheus metrics' })
  @ApiResponse({
    status: 200,
    description: 'Prometheus metrics in text format',
  })
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint for metrics' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }
}

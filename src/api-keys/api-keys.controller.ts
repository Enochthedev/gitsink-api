import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EnhancedJwtGuard } from '../auth/enhanced-jwt.guard';
import { ApiKeysService } from './api-keys.service';
import {
  ApiKeyCreatedResponseDto,
  ApiKeyResponseDto,
  CreateApiKeyDto,
  RevokeApiKeyDto,
  UpdateApiKeyDto,
} from './dto/api-key.dto';

interface RequestWithUser extends Request {
  user: { id: string; email: string };
}

@ApiTags('API Keys')
@Controller('api-keys')
@UseGuards(EnhancedJwtGuard)
@ApiBearerAuth()
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  @ApiOperation({
    summary: 'List all API keys',
    description: 'Get all API keys for the authenticated user',
  })
  @ApiResponse({ status: 200, description: 'List of API keys', type: [ApiKeyResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listApiKeys(@Req() req: RequestWithUser): Promise<ApiKeyResponseDto[]> {
    return this.apiKeysService.listApiKeys(req.user.id);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get API key statistics',
    description: 'Get usage stats and limits for API keys',
  })
  @ApiResponse({ status: 200, description: 'API key statistics' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getApiKeyStats(@Req() req: RequestWithUser) {
    return this.apiKeysService.getApiKeyStats(req.user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get API key details',
    description: 'Get details for a specific API key',
  })
  @ApiParam({ name: 'id', description: 'API key ID' })
  @ApiResponse({ status: 200, description: 'API key details', type: ApiKeyResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async getApiKey(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
  ): Promise<ApiKeyResponseDto> {
    return this.apiKeysService.getApiKey(req.user.id, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new API key',
    description: 'Create a new API key. The full key is only shown once in the response!',
  })
  @ApiResponse({
    status: 201,
    description: 'API key created. Save the apiKey value - it will not be shown again!',
    type: ApiKeyCreatedResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'API key limit reached' })
  async createApiKey(
    @Req() req: RequestWithUser,
    @Body() dto: CreateApiKeyDto,
  ): Promise<ApiKeyCreatedResponseDto> {
    return this.apiKeysService.createApiKey(req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an API key', description: 'Update API key settings' })
  @ApiParam({ name: 'id', description: 'API key ID' })
  @ApiResponse({ status: 200, description: 'API key updated', type: ApiKeyResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async updateApiKey(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateApiKeyDto,
  ): Promise<ApiKeyResponseDto> {
    return this.apiKeysService.updateApiKey(req.user.id, id, dto);
  }

  @Post(':id/rotate')
  @ApiOperation({
    summary: 'Rotate an API key',
    description: 'Regenerate the API key while keeping the same ID and settings',
  })
  @ApiParam({ name: 'id', description: 'API key ID' })
  @ApiResponse({
    status: 200,
    description: 'New API key generated. Save it - it will not be shown again!',
    type: ApiKeyCreatedResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async rotateApiKey(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
  ): Promise<ApiKeyCreatedResponseDto> {
    return this.apiKeysService.rotateApiKey(req.user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key', description: 'Permanently revoke an API key' })
  @ApiParam({ name: 'id', description: 'API key ID' })
  @ApiResponse({ status: 204, description: 'API key revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async revokeApiKey(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: RevokeApiKeyDto,
  ): Promise<void> {
    await this.apiKeysService.revokeApiKey(req.user.id, id, dto.reason);
  }
}

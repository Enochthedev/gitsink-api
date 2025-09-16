import { Controller, Get, Redirect } from '@nestjs/common';
import { ApiTags, ApiOkResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { AppService } from './app.service';
import { ParseResult } from './parser/types/portfolio.types';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  @ApiOkResponse({ description: 'Parsed Portfolio markdown' })
  getHello(): ParseResult {
    return this.appService.getHello();
  }

  @Get('docs')
  @ApiExcludeEndpoint()
  @Redirect('/api-docs', 302)
  redirectToDocs() {
    // Redirect /docs to /api-docs for convenience
  }
}

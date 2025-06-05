import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PortfolioMetadata } from './parser/types/portfolio.schema';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): PortfolioMetadata {
    return this.appService.getHello();
  }
}

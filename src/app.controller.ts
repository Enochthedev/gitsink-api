import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ParseResult } from './parser/types/portfolio.types';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): ParseResult {
    return this.appService.getHello();
  }
}

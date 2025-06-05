import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ParserService } from './parser/parser.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, ParserService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should parse markdown sample', () => {
      const result = appController.getHello();
      expect(result).toEqual({
        title: 'Test Project',
        description: 'Just testing.',
        tags: ['test'],
        body: 'Some more body content.',
      });
    });
  });
});

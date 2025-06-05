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
      expect(result.title).toBe('Test Project');
      expect(result.description).toBe('Just testing.');
      expect(result.tags).toEqual(['test']);
      expect(result.body).toBe('Some more body content.');
    });
  });
});

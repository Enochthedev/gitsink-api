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
      if (!result.valid) throw new Error('Expected valid result');
      expect(result.data.title).toBe('Test Project');
      expect(result.data.description).toBe('Just testing.');
      expect(result.data.tags).toEqual(['test']);
      expect(result.data.body).toBe('Some more body content.');
    });
  });
});

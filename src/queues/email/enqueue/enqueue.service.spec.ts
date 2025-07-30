import { Test, TestingModule } from '@nestjs/testing';
import { EnqueueService } from './enqueue.service';

describe('EnqueueService', () => {
  let service: EnqueueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EnqueueService],
    }).compile();

    service = module.get<EnqueueService>(EnqueueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

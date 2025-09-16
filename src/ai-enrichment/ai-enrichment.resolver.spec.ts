import { Test, TestingModule } from '@nestjs/testing';
import { AIEnrichmentResolver } from './ai-enrichment.resolver';
import { AIEnrichmentService } from './ai-enrichment.service';
import { PubSub } from 'graphql-subscriptions';

describe('AIEnrichmentResolver', () => {
  let resolver: AIEnrichmentResolver;
  let aiEnrichmentService: AIEnrichmentService;
  let pubSub: PubSub;

  const mockAIEnrichmentService = {
    getAnalysisForProject: jest.fn(),
    getUserAnalyses: jest.fn(),
    getRecentAnalyses: jest.fn(),
    triggerEnrichment: jest.fn(),
    bulkTriggerEnrichment: jest.fn(),
    getEnrichmentJobs: jest.fn(),
  };

  const mockPubSub = {
    publish: jest.fn(),
    subscribe: jest.fn(),
    asyncIterator: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIEnrichmentResolver,
        {
          provide: AIEnrichmentService,
          useValue: mockAIEnrichmentService,
        },
        {
          provide: 'PUB_SUB',
          useValue: mockPubSub,
        },
      ],
    }).compile();

    resolver = module.get<AIEnrichmentResolver>(AIEnrichmentResolver);
    aiEnrichmentService = module.get<AIEnrichmentService>(AIEnrichmentService);
    pubSub = module.get<PubSub>('PUB_SUB');
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  describe('projectAnalysis', () => {
    it('should return AI analysis for a project', async () => {
      const mockAnalysis = {
        id: '1',
        projectId: 'project-1',
        description: 'AI generated description',
        technologies: {
          languages: [],
          frameworks: [],
          databases: [],
          tools: [],
          platforms: [],
          buildTools: [],
          testingFrameworks: [],
        },
        category: {
          primary: 'web',
          confidence: 0.9,
          tags: ['frontend'],
        },
        complexity: 'moderate' as const,
        suggestedTags: ['react', 'typescript'],
        keyFeatures: ['responsive design'],
        confidence: 0.85,
        model: 'gpt-4',
        version: 1,
        analysisDate: new Date(),
        createdAt: new Date(),
      };

      mockAIEnrichmentService.getAnalysisForProject.mockResolvedValue(mockAnalysis);

      const result = await resolver.projectAnalysis('project-1', {
        req: { user: { id: 'user-1' } },
      });

      expect(result).toEqual(mockAnalysis);
      expect(mockAIEnrichmentService.getAnalysisForProject).toHaveBeenCalledWith(
        'project-1',
        'user-1',
      );
    });
  });

  describe('triggerEnrichment', () => {
    it('should trigger enrichment and publish status update', async () => {
      const mockJob = {
        id: 'job-1',
        projectId: 'project-1',
        status: 'pending' as const,
        createdAt: new Date(),
      };

      mockAIEnrichmentService.triggerEnrichment.mockResolvedValue(mockJob);

      const input = {
        projectId: 'project-1',
        forceReanalysis: false,
      };

      const result = await resolver.triggerEnrichment(input, {
        req: { user: { id: 'user-1' } },
      });

      expect(result).toEqual(mockJob);
      expect(mockAIEnrichmentService.triggerEnrichment).toHaveBeenCalledWith(
        'project-1',
        'user-1',
        false,
        undefined,
      );
      expect(mockPubSub.publish).toHaveBeenCalledWith('enrichmentStatus', {
        enrichmentStatus: {
          jobId: 'job-1',
          projectId: 'project-1',
          status: 'pending',
          timestamp: expect.any(Date),
        },
      });
    });
  });

  describe('bulkTriggerEnrichment', () => {
    it('should trigger bulk enrichment', async () => {
      const mockResult = {
        jobs: [],
        totalJobs: 2,
        successfulJobs: 2,
        failedJobs: 0,
      };

      mockAIEnrichmentService.bulkTriggerEnrichment.mockResolvedValue(mockResult);

      const input = {
        projectIds: ['project-1', 'project-2'],
        forceReanalysis: false,
      };

      const result = await resolver.bulkTriggerEnrichment(input, {
        req: { user: { id: 'user-1' } },
      });

      expect(result).toEqual(mockResult);
      expect(mockAIEnrichmentService.bulkTriggerEnrichment).toHaveBeenCalledWith(
        ['project-1', 'project-2'],
        'user-1',
        false,
        undefined,
      );
    });
  });

  describe('enrichmentStatus', () => {
    it('should return async iterator for enrichment status updates', () => {
      const mockIterator = Symbol('asyncIterator');
      mockPubSub.asyncIterator.mockReturnValue(mockIterator);

      const result = resolver.enrichmentStatus('project-1');

      expect(result).toBe(mockIterator);
      expect(mockPubSub.asyncIterator).toHaveBeenCalledWith('enrichmentStatus');
    });
  });
});

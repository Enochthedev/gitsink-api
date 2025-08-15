import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AIEnrichmentService } from './ai-enrichment.service';
import { TechnologyDetectionService } from './technology-detection.service';
import { DescriptionGenerationService } from './description-generation.service';
import { ProjectCategorizationService } from './project-categorization.service';
import { PrismaService } from '../prisma/prisma.service';
import {
    RepositoryContent,
    TechnologyStack,
    ProjectCategory,
    AIAnalysisResult,
} from './interfaces/ai-enrichment.interface';

describe('AIEnrichmentService', () => {
    let service: AIEnrichmentService;
    let prismaService: jest.Mocked<PrismaService>;
    let technologyDetection: jest.Mocked<TechnologyDetectionService>;
    let descriptionGeneration: jest.Mocked<DescriptionGenerationService>;
    let projectCategorization: jest.Mocked<ProjectCategorizationService>;

    const mockRepositoryContent: RepositoryContent = {
        files: [
            {
                path: 'src/index.js',
                name: 'index.js',
                extension: '.js',
                size: 1024,
                content: 'console.log("Hello World");',
                language: 'JavaScript',
            },
            {
                path: 'package.json',
                name: 'package.json',
                extension: '.json',
                size: 512,
                content: '{"name": "test-project", "dependencies": {"express": "^4.18.0"}}',
            },
        ],
        readme: 'This is a test project for demonstrating AI enrichment capabilities.',
        packageJson: {
            name: 'test-project',
            dependencies: {
                express: '^4.18.0',
            },
        },
        languages: {
            JavaScript: 1024,
            JSON: 512,
        },
        totalSize: 1536,
    };

    const mockTechnologyStack: TechnologyStack = {
        languages: [
            { name: 'JavaScript', percentage: 66.7, bytes: 1024, confidence: 0.9 },
            { name: 'JSON', percentage: 33.3, bytes: 512, confidence: 0.8 },
        ],
        frameworks: [
            { name: 'express', version: '^4.18.0', confidence: 0.9, category: 'backend' },
        ],
        databases: [],
        tools: ['git', 'npm'],
        platforms: [],
        buildTools: [],
        testingFrameworks: [],
    };

    const mockProjectCategory: ProjectCategory = {
        primary: 'web-application',
        secondary: ['backend'],
        confidence: 0.85,
        tags: ['javascript', 'express', 'backend'],
    };

    const mockDescriptionResult = {
        description: 'A JavaScript web application built with Express.js for backend services.',
        confidence: 0.8,
    };

    beforeEach(async () => {
        const mockPrismaService = {
            aIAnalysis: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({
                    id: 'test-id',
                    projectId: 'test-project-id',
                    version: 1,
                    analysis: {} as any,
                    confidence: 0.8,
                    model: 'gitsink-ai-v1',
                    createdAt: new Date(),
                }),
            },
        };

        const mockTechnologyDetectionService = {
            detectTechnologies: jest.fn(),
        };

        const mockDescriptionGenerationService = {
            generateDescription: jest.fn(),
        };

        const mockProjectCategorizationService = {
            categorizeProject: jest.fn(),
        };

        const mockConfigService = {
            get: jest.fn((key: string, defaultValue?: any) => {
                const config = {
                    AI_SERVICE_URL: 'https://api.example.com',
                    AI_SERVICE_API_KEY: 'test-api-key',
                    ENABLE_AI_DESCRIPTION: true,
                    ENABLE_TECHNOLOGY_DETECTION: true,
                    ENABLE_CATEGORIZATION: true,
                    AI_CONFIDENCE_THRESHOLD: 0.7,
                    MAX_FILE_SIZE: 1024 * 1024,
                    MAX_FILES_TO_ANALYZE: 100,
                    SUPPORTED_LANGUAGES: 'javascript,typescript,python,java',
                };
                return config[key] || defaultValue;
            }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AIEnrichmentService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: TechnologyDetectionService, useValue: mockTechnologyDetectionService },
                { provide: DescriptionGenerationService, useValue: mockDescriptionGenerationService },
                { provide: ProjectCategorizationService, useValue: mockProjectCategorizationService },
                { provide: ConfigService, useValue: mockConfigService },
            ],
        }).compile();

        service = module.get<AIEnrichmentService>(AIEnrichmentService);
        prismaService = module.get(PrismaService);
        technologyDetection = module.get(TechnologyDetectionService);
        descriptionGeneration = module.get(DescriptionGenerationService);
        projectCategorization = module.get(ProjectCategorizationService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('analyzeRepository', () => {
        beforeEach(() => {
            technologyDetection.detectTechnologies.mockResolvedValue(mockTechnologyStack);
            descriptionGeneration.generateDescription.mockResolvedValue(mockDescriptionResult);
            projectCategorization.categorizeProject.mockResolvedValue(mockProjectCategory);
            (prismaService.aIAnalysis.findFirst as jest.Mock).mockResolvedValue(null);
            (prismaService.aIAnalysis.create as jest.Mock).mockResolvedValue({
                id: 'test-id',
                projectId: 'test-project-id',
                version: 1,
                analysis: {} as any,
                confidence: 0.8,
                model: 'gitsink-ai-v1',
                createdAt: new Date(),
            });
        });

        it('should analyze repository and return comprehensive results', async () => {
            const result = await service.analyzeRepository('test-project-id', mockRepositoryContent);

            expect(result).toBeDefined();
            expect(result.description).toBe(mockDescriptionResult.description);
            expect(result.technologies).toEqual(mockTechnologyStack);
            expect(result.category).toEqual(mockProjectCategory);
            expect(result.complexity).toBeDefined();
            expect(result.suggestedTags).toBeDefined();
            expect(result.keyFeatures).toBeDefined();
            expect(result.confidence).toBeGreaterThan(0);
            expect(result.model).toBe('gitsink-ai-v1');
            expect(result.version).toBe(1);
        });

        it('should call all analysis services', async () => {
            await service.analyzeRepository('test-project-id', mockRepositoryContent);

            expect(technologyDetection.detectTechnologies).toHaveBeenCalledWith(mockRepositoryContent);
            expect(descriptionGeneration.generateDescription).toHaveBeenCalledWith(mockRepositoryContent);
            expect(projectCategorization.categorizeProject).toHaveBeenCalledWith(mockRepositoryContent);
        });

        it('should store analysis result in database', async () => {
            await service.analyzeRepository('test-project-id', mockRepositoryContent);

            expect(prismaService.aIAnalysis.create).toHaveBeenCalledWith({
                data: {
                    projectId: 'test-project-id',
                    version: 1,
                    analysis: expect.any(Object),
                    confidence: expect.any(Number),
                    model: 'gitsink-ai-v1',
                },
            });
        });

        it('should use existing analysis if recent and not forced', async () => {
            const existingAnalysis = {
                id: 'existing-id',
                projectId: 'test-project-id',
                version: 1,
                analysis: {
                    description: 'Existing description',
                    technologies: mockTechnologyStack,
                    category: mockProjectCategory,
                    complexity: 'simple',
                    suggestedTags: ['test'],
                    keyFeatures: ['feature1'],
                    confidence: 0.9,
                    model: 'gitsink-ai-v1',
                    analysisDate: new Date(),
                },
                confidence: 0.9,
                model: 'gitsink-ai-v1',
                createdAt: new Date(), // Recent date
            };

            (prismaService.aIAnalysis.findFirst as jest.Mock).mockResolvedValue(existingAnalysis);

            const result = await service.analyzeRepository('test-project-id', mockRepositoryContent, false);

            expect(result.description).toBe('Existing description');
            expect(technologyDetection.detectTechnologies).not.toHaveBeenCalled();
            expect(descriptionGeneration.generateDescription).not.toHaveBeenCalled();
            expect(projectCategorization.categorizeProject).not.toHaveBeenCalled();
        });

        it('should force reanalysis when requested', async () => {
            const existingAnalysis = {
                id: 'existing-id',
                projectId: 'test-project-id',
                version: 1,
                analysis: {},
                confidence: 0.9,
                model: 'gitsink-ai-v1',
                createdAt: new Date(),
            };

            (prismaService.aIAnalysis.findFirst as jest.Mock).mockResolvedValue(existingAnalysis);

            await service.analyzeRepository('test-project-id', mockRepositoryContent, true);

            expect(technologyDetection.detectTechnologies).toHaveBeenCalled();
            expect(descriptionGeneration.generateDescription).toHaveBeenCalled();
            expect(projectCategorization.categorizeProject).toHaveBeenCalled();
        });

        it('should handle analysis service failures gracefully', async () => {
            technologyDetection.detectTechnologies.mockRejectedValue(new Error('Technology detection failed'));
            descriptionGeneration.generateDescription.mockRejectedValue(new Error('Description generation failed'));
            projectCategorization.categorizeProject.mockRejectedValue(new Error('Categorization failed'));

            const result = await service.analyzeRepository('test-project-id', mockRepositoryContent);

            expect(result).toBeDefined();
            expect(result.description).toBe('No description available');
            expect(result.technologies.languages).toEqual([]);
            expect(result.category.primary).toBe('other');
        });

        it('should calculate complexity correctly', async () => {
            const complexContent: RepositoryContent = {
                ...mockRepositoryContent,
                files: Array(150).fill(null).map((_, i) => ({
                    path: `src/file${i}.js`,
                    name: `file${i}.js`,
                    extension: '.js',
                    size: 1024,
                })),
                totalSize: 150 * 1024,
            };

            const result = await service.analyzeRepository('test-project-id', complexContent);

            expect(result.complexity).toBe('moderate');
        });

        it('should generate appropriate suggested tags', async () => {
            const result = await service.analyzeRepository('test-project-id', mockRepositoryContent);

            expect(result.suggestedTags).toContain('javascript');
            expect(result.suggestedTags).toContain('express');
            expect(result.suggestedTags).toContain('backend');
        });

        it('should extract key features correctly', async () => {
            const contentWithFeatures: RepositoryContent = {
                ...mockRepositoryContent,
                files: [
                    ...mockRepositoryContent.files,
                    {
                        path: 'test/index.test.js',
                        name: 'index.test.js',
                        extension: '.js',
                        size: 512,
                        content: 'test content',
                    },
                    {
                        path: 'Dockerfile',
                        name: 'Dockerfile',
                        extension: '',
                        size: 256,
                        content: 'FROM node:16',
                    },
                ],
            };

            const result = await service.analyzeRepository('test-project-id', contentWithFeatures);

            expect(result.keyFeatures).toContain('Automated Testing');
            expect(result.keyFeatures).toContain('Docker Support');
        });
    });

    describe('getLatestAnalysis', () => {
        it('should retrieve latest analysis for a project', async () => {
            const mockAnalysis = {
                id: 'test-id',
                projectId: 'test-project-id',
                version: 1,
                analysis: {},
                confidence: 0.8,
                model: 'gitsink-ai-v1',
                createdAt: new Date(),
            };

            (prismaService.aIAnalysis.findFirst as jest.Mock).mockResolvedValue(mockAnalysis);

            const result = await service.getLatestAnalysis('test-project-id');

            expect(result).toEqual(mockAnalysis);
            expect(prismaService.aIAnalysis.findFirst).toHaveBeenCalledWith({
                where: { projectId: 'test-project-id' },
                orderBy: { createdAt: 'desc' },
            });
        });

        it('should return null if no analysis exists', async () => {
            (prismaService.aIAnalysis.findFirst as jest.Mock).mockResolvedValue(null);

            const result = await service.getLatestAnalysis('test-project-id');

            expect(result).toBeNull();
        });
    });

    describe('error handling', () => {
        it('should throw error when analysis fails completely', async () => {
            technologyDetection.detectTechnologies.mockRejectedValue(new Error('Service unavailable'));
            descriptionGeneration.generateDescription.mockRejectedValue(new Error('Service unavailable'));
            projectCategorization.categorizeProject.mockRejectedValue(new Error('Service unavailable'));
            (prismaService.aIAnalysis.create as jest.Mock).mockRejectedValue(new Error('Database error'));

            await expect(
                service.analyzeRepository('test-project-id', mockRepositoryContent)
            ).rejects.toThrow('AI analysis failed');
        });
    });

    describe('configuration', () => {
        it('should load configuration correctly', () => {
            // Configuration is loaded in constructor, so we just verify the service was created
            expect(service).toBeDefined();
        });
    });
});
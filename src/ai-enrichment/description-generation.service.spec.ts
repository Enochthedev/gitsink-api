import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { DescriptionGenerationService } from './description-generation.service';
import { RepositoryContent } from './interfaces/ai-enrichment.interface';

describe('DescriptionGenerationService', () => {
    let service: DescriptionGenerationService;
    let httpService: jest.Mocked<HttpService>;
    let configService: jest.Mocked<ConfigService>;

    const mockRepositoryContent: RepositoryContent = {
        files: [
            {
                path: 'src/index.js',
                name: 'index.js',
                extension: '.js',
                size: 1024,
                content: 'const express = require("express");',
                language: 'JavaScript',
            },
            {
                path: 'package.json',
                name: 'package.json',
                extension: '.json',
                size: 512,
                content: JSON.stringify({
                    name: 'test-api',
                    dependencies: { express: '^4.18.0' },
                }),
            },
            {
                path: 'test/index.test.js',
                name: 'index.test.js',
                extension: '.js',
                size: 256,
                content: 'test content',
            },
        ],
        readme: 'This is a REST API built with Express.js for handling user authentication and data management.',
        packageJson: {
            name: 'test-api',
            dependencies: { express: '^4.18.0' },
        },
        languages: {
            JavaScript: 1280,
            JSON: 512,
        },
        totalSize: 1792,
    };

    beforeEach(async () => {
        const mockHttpService = {
            post: jest.fn(),
        };

        const mockConfigService = {
            get: jest.fn((key: string, defaultValue?: any) => {
                const config = {
                    AI_SERVICE_URL: 'https://api.example.com',
                    AI_SERVICE_API_KEY: 'test-api-key',
                };
                return config[key] || defaultValue;
            }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DescriptionGenerationService,
                { provide: HttpService, useValue: mockHttpService },
                { provide: ConfigService, useValue: mockConfigService },
            ],
        }).compile();

        service = module.get<DescriptionGenerationService>(DescriptionGenerationService);
        httpService = module.get(HttpService);
        configService = module.get(ConfigService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('generateDescription', () => {
        it('should generate description using AI service when configured', async () => {
            const mockAIResponse = {
                data: {
                    description: 'A Node.js REST API built with Express.js for user management and authentication.',
                    confidence: 0.9,
                },
            };

            httpService.post.mockReturnValue(of(mockAIResponse));

            const result = await service.generateDescription(mockRepositoryContent);

            expect(result.description).toBe(mockAIResponse.data.description);
            expect(result.confidence).toBe(0.9);
            expect(httpService.post).toHaveBeenCalledWith(
                'https://api.example.com/generate-description',
                expect.objectContaining({
                    prompt: expect.stringContaining('JavaScript'),
                    max_tokens: 200,
                    temperature: 0.7,
                    model: 'gpt-3.5-turbo',
                }),
                expect.objectContaining({
                    headers: {
                        'Authorization': 'Bearer test-api-key',
                        'Content-Type': 'application/json',
                    },
                    timeout: 30000,
                })
            );
        });

        it('should fallback to rule-based generation when AI service fails', async () => {
            httpService.post.mockReturnValue(throwError(() => new Error('AI service unavailable')));

            const result = await service.generateDescription(mockRepositoryContent);

            expect(result.description).toBeDefined();
            expect(result.description.length).toBeGreaterThan(0);
            expect(result.confidence).toBe(0.6); // Lower confidence for fallback
        });

        it('should use fallback when AI service is not configured', async () => {
            configService.get.mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'AI_SERVICE_URL') return '';
                if (key === 'AI_SERVICE_API_KEY') return '';
                return defaultValue;
            });

            // Create new service instance with empty config
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    DescriptionGenerationService,
                    { provide: HttpService, useValue: httpService },
                    { provide: ConfigService, useValue: configService },
                ],
            }).compile();

            const serviceWithoutAI = module.get<DescriptionGenerationService>(DescriptionGenerationService);

            const result = await serviceWithoutAI.generateDescription(mockRepositoryContent);

            expect(result.description).toBeDefined();
            expect(result.confidence).toBe(0.6);
            expect(httpService.post).not.toHaveBeenCalled();
        });

        it('should generate appropriate description for web application', async () => {
            const webAppContent: RepositoryContent = {
                ...mockRepositoryContent,
                files: [
                    ...mockRepositoryContent.files,
                    {
                        path: 'src/components/App.jsx',
                        name: 'App.jsx',
                        extension: '.jsx',
                        size: 1024,
                        content: 'import React from "react";',
                    },
                ],
                packageJson: {
                    name: 'web-app',
                    dependencies: { react: '^18.0.0', express: '^4.18.0' },
                },
            };

            httpService.post.mockReturnValue(throwError(() => new Error('Use fallback')));

            const result = await service.generateDescription(webAppContent);

            expect(result.description).toContain('JavaScript');
            expect(result.description.toLowerCase()).toContain('web');
        });

        it('should generate appropriate description for mobile application', async () => {
            const mobileContent: RepositoryContent = {
                files: [
                    {
                        path: 'lib/main.dart',
                        name: 'main.dart',
                        extension: '.dart',
                        size: 1024,
                        content: 'import "package:flutter/material.dart";',
                    },
                    {
                        path: 'pubspec.yaml',
                        name: 'pubspec.yaml',
                        extension: '.yaml',
                        size: 256,
                        content: 'dependencies:\n  flutter:',
                    },
                ],
                languages: { Dart: 1024 },
                totalSize: 1280,
            };

            httpService.post.mockReturnValue(throwError(() => new Error('Use fallback')));

            const result = await service.generateDescription(mobileContent);

            expect(result.description).toContain('Dart');
            expect(result.description.toLowerCase()).toContain('mobile');
        });

        it('should generate appropriate description for data science project', async () => {
            const dataScienceContent: RepositoryContent = {
                files: [
                    {
                        path: 'analysis.py',
                        name: 'analysis.py',
                        extension: '.py',
                        size: 2048,
                        content: 'import pandas as pd\nimport numpy as np\nimport matplotlib.pyplot as plt',
                    },
                    {
                        path: 'requirements.txt',
                        name: 'requirements.txt',
                        extension: '.txt',
                        size: 256,
                        content: 'pandas\nnumpy\nmatplotlib',
                    },
                ],
                readme: 'Data analysis project for machine learning research',
                languages: { Python: 2048 },
                totalSize: 2304,
            };

            httpService.post.mockReturnValue(throwError(() => new Error('Use fallback')));

            const result = await service.generateDescription(dataScienceContent);

            expect(result.description).toContain('Python');
            expect(result.description.toLowerCase()).toContain('data');
        });

        it('should generate appropriate description for CLI tool', async () => {
            const cliContent: RepositoryContent = {
                files: [
                    {
                        path: 'bin/cli.js',
                        name: 'cli.js',
                        extension: '.js',
                        size: 1024,
                        content: '#!/usr/bin/env node\nconsole.log("CLI tool");',
                    },
                    {
                        path: 'package.json',
                        name: 'package.json',
                        extension: '.json',
                        size: 256,
                        content: JSON.stringify({
                            name: 'my-cli',
                            bin: { 'my-cli': './bin/cli.js' },
                        }),
                    },
                ],
                languages: { JavaScript: 1024 },
                totalSize: 1280,
            };

            httpService.post.mockReturnValue(throwError(() => new Error('Use fallback')));

            const result = await service.generateDescription(cliContent);

            expect(result.description).toContain('JavaScript');
            expect(result.description.toLowerCase()).toContain('command-line');
        });

        it('should generate appropriate description for library', async () => {
            const libraryContent: RepositoryContent = {
                files: [
                    {
                        path: 'src/index.js',
                        name: 'index.js',
                        extension: '.js',
                        size: 1024,
                        content: 'module.exports = { utility: function() {} };',
                    },
                    {
                        path: 'package.json',
                        name: 'package.json',
                        extension: '.json',
                        size: 256,
                        content: JSON.stringify({
                            name: 'utility-lib',
                            main: 'src/index.js',
                        }),
                    },
                ],
                languages: { JavaScript: 1024 },
                totalSize: 1280,
            };

            httpService.post.mockReturnValue(throwError(() => new Error('Use fallback')));

            const result = await service.generateDescription(libraryContent);

            expect(result.description).toContain('JavaScript');
            expect(result.description.toLowerCase()).toContain('library');
        });

        it('should handle AI service timeout', async () => {
            httpService.post.mockReturnValue(throwError(() => new Error('timeout')));

            const result = await service.generateDescription(mockRepositoryContent);

            expect(result.description).toBeDefined();
            expect(result.confidence).toBe(0.6); // Fallback confidence
        });

        it('should build appropriate prompt for AI service', async () => {
            const mockAIResponse = {
                data: {
                    description: 'Test description',
                    confidence: 0.8,
                },
            };

            httpService.post.mockReturnValue(of(mockAIResponse));

            await service.generateDescription(mockRepositoryContent);

            const callArgs = httpService.post.mock.calls[0];
            const requestBody = callArgs[1];

            expect(requestBody.prompt).toContain('JavaScript');
            expect(requestBody.prompt).toContain('File count: 3');
            expect(requestBody.prompt).toContain('Has README: true');
            expect(requestBody.prompt).toContain('This is a REST API built with Express.js');
        });

        it('should handle empty repository content', async () => {
            const emptyContent: RepositoryContent = {
                files: [],
                languages: {},
                totalSize: 0,
            };

            httpService.post.mockReturnValue(throwError(() => new Error('Use fallback')));

            const result = await service.generateDescription(emptyContent);

            expect(result.description).toBeDefined();
            expect(result.description.length).toBeGreaterThan(0);
        });

        it('should include key features in description', async () => {
            const contentWithFeatures: RepositoryContent = {
                ...mockRepositoryContent,
                files: [
                    ...mockRepositoryContent.files,
                    {
                        path: 'Dockerfile',
                        name: 'Dockerfile',
                        extension: '',
                        size: 256,
                        content: 'FROM node:16',
                    },
                ],
            };

            httpService.post.mockReturnValue(throwError(() => new Error('Use fallback')));

            const result = await service.generateDescription(contentWithFeatures);

            expect(result.description).toContain('containerization support');
        });

        it('should format languages correctly in description', async () => {
            const multiLanguageContent: RepositoryContent = {
                ...mockRepositoryContent,
                languages: {
                    JavaScript: 1000,
                    TypeScript: 800,
                    Python: 600,
                    Go: 400,
                },
            };

            httpService.post.mockReturnValue(throwError(() => new Error('Use fallback')));

            const result = await service.generateDescription(multiLanguageContent);

            expect(result.description).toContain('JavaScript, TypeScript, and Python');
        });
    });

    describe('error handling', () => {
        it('should handle malformed AI service response', async () => {
            const malformedResponse = {
                data: {
                    // Missing description field
                    confidence: 0.8,
                },
            };

            httpService.post.mockReturnValue(of(malformedResponse));

            const result = await service.generateDescription(mockRepositoryContent);

            expect(result.description).toBeDefined();
            expect(result.confidence).toBe(0.6); // Should fallback
        });

        it('should handle network errors gracefully', async () => {
            httpService.post.mockReturnValue(throwError(() => new Error('Network error')));

            const result = await service.generateDescription(mockRepositoryContent);

            expect(result.description).toBeDefined();
            expect(result.confidence).toBe(0.6);
        });
    });
});
import { Test, TestingModule } from '@nestjs/testing';
import { TechnologyDetectionService } from './technology-detection.service';
import { RepositoryContent } from './interfaces/ai-enrichment.interface';

describe('TechnologyDetectionService', () => {
    let service: TechnologyDetectionService;

    const mockRepositoryContent: RepositoryContent = {
        files: [
            {
                path: 'src/index.js',
                name: 'index.js',
                extension: '.js',
                size: 1024,
                content: 'const express = require("express"); const app = express();',
                language: 'JavaScript',
            },
            {
                path: 'package.json',
                name: 'package.json',
                extension: '.json',
                size: 512,
                content: JSON.stringify({
                    name: 'test-project',
                    dependencies: {
                        express: '^4.18.0',
                        react: '^18.0.0',
                        jest: '^29.0.0',
                    },
                    devDependencies: {
                        '@types/node': '^18.0.0',
                    },
                }),
            },
            {
                path: 'src/components/App.jsx',
                name: 'App.jsx',
                extension: '.jsx',
                size: 2048,
                content: 'import React from "react"; export default function App() { return <div>Hello</div>; }',
            },
            {
                path: 'test/app.test.js',
                name: 'app.test.js',
                extension: '.js',
                size: 512,
                content: 'describe("App", () => { test("renders", () => {}); });',
            },
            {
                path: 'Dockerfile',
                name: 'Dockerfile',
                extension: '',
                size: 256,
                content: 'FROM node:16\nCOPY . .\nRUN npm install',
            },
        ],
        readme: 'A React application with Express backend',
        packageJson: {
            name: 'test-project',
            dependencies: {
                express: '^4.18.0',
                react: '^18.0.0',
                jest: '^29.0.0',
            },
            devDependencies: {
                '@types/node': '^18.0.0',
            },
        },
        languages: {
            JavaScript: 3584,
            JSON: 512,
        },
        totalSize: 4096,
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [TechnologyDetectionService],
        }).compile();

        service = module.get<TechnologyDetectionService>(TechnologyDetectionService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('detectTechnologies', () => {
        it('should detect technologies from repository content', async () => {
            const result = await service.detectTechnologies(mockRepositoryContent);

            expect(result).toBeDefined();
            expect(result.languages).toBeDefined();
            expect(result.frameworks).toBeDefined();
            expect(result.databases).toBeDefined();
            expect(result.tools).toBeDefined();
            expect(result.platforms).toBeDefined();
            expect(result.buildTools).toBeDefined();
            expect(result.testingFrameworks).toBeDefined();
        });

        it('should detect languages correctly', async () => {
            const result = await service.detectTechnologies(mockRepositoryContent);

            expect(result.languages).toHaveLength(2);
            expect(result.languages[0].name).toBe('JavaScript');
            expect(result.languages[0].percentage).toBeCloseTo(87.5, 1);
            expect(result.languages[0].bytes).toBe(3584);
            expect(result.languages[0].confidence).toBeGreaterThan(0.8);

            expect(result.languages[1].name).toBe('JSON');
            expect(result.languages[1].percentage).toBeCloseTo(12.5, 1);
            expect(result.languages[1].bytes).toBe(512);
        });

        it('should detect frameworks correctly', async () => {
            const result = await service.detectTechnologies(mockRepositoryContent);

            const reactFramework = result.frameworks.find(f => f.name === 'react');
            const expressFramework = result.frameworks.find(f => f.name === 'express');

            expect(reactFramework).toBeDefined();
            expect(reactFramework?.version).toBe('^18.0.0');
            expect(reactFramework?.category).toBe('web');
            expect(reactFramework?.confidence).toBeGreaterThan(0.5);

            expect(expressFramework).toBeDefined();
            expect(expressFramework?.version).toBe('^4.18.0');
            expect(expressFramework?.category).toBe('backend');
        });

        it('should detect testing frameworks', async () => {
            const result = await service.detectTechnologies(mockRepositoryContent);

            expect(result.testingFrameworks).toContain('jest');
        });

        it('should detect build tools', async () => {
            const result = await service.detectTechnologies(mockRepositoryContent);

            expect(result.buildTools).toContain('docker');
        });

        it('should detect tools', async () => {
            const result = await service.detectTechnologies(mockRepositoryContent);

            expect(result.tools).toContain('git');
        });

        it('should handle empty repository content', async () => {
            const emptyContent: RepositoryContent = {
                files: [],
                languages: {},
                totalSize: 0,
            };

            const result = await service.detectTechnologies(emptyContent);

            expect(result.languages).toHaveLength(0);
            expect(result.frameworks).toHaveLength(0);
            expect(result.databases).toHaveLength(0);
            expect(result.tools).toHaveLength(0);
        });

        it('should detect languages from file extensions when GitHub data is missing', async () => {
            const contentWithoutLanguageData: RepositoryContent = {
                ...mockRepositoryContent,
                languages: {},
            };

            const result = await service.detectTechnologies(contentWithoutLanguageData);

            expect(result.languages.length).toBeGreaterThan(0);
            expect(result.languages.some(l => l.name === 'JavaScript')).toBe(true);
        });

        it('should detect Python data science frameworks', async () => {
            const pythonContent: RepositoryContent = {
                files: [
                    {
                        path: 'main.py',
                        name: 'main.py',
                        extension: '.py',
                        size: 1024,
                        content: 'import pandas as pd\nimport numpy as np\nimport tensorflow as tf',
                    },
                    {
                        path: 'requirements.txt',
                        name: 'requirements.txt',
                        extension: '.txt',
                        size: 256,
                        content: 'pandas==1.5.0\nnumpy==1.24.0\ntensorflow==2.10.0',
                    },
                ],
                languages: { Python: 1024 },
                totalSize: 1280,
            };

            const result = await service.detectTechnologies(pythonContent);

            const tensorflowFramework = result.frameworks.find(f => f.name === 'tensorflow');
            expect(tensorflowFramework).toBeDefined();
            expect(tensorflowFramework?.category).toBe('ml');
        });

        it('should detect mobile frameworks', async () => {
            const mobileContent: RepositoryContent = {
                files: [
                    {
                        path: 'pubspec.yaml',
                        name: 'pubspec.yaml',
                        extension: '.yaml',
                        size: 512,
                        content: 'dependencies:\n  flutter:\n    sdk: flutter',
                    },
                    {
                        path: 'lib/main.dart',
                        name: 'main.dart',
                        extension: '.dart',
                        size: 1024,
                        content: 'import "package:flutter/material.dart";',
                    },
                ],
                languages: { Dart: 1024 },
                totalSize: 1536,
            };

            const result = await service.detectTechnologies(mobileContent);

            const flutterFramework = result.frameworks.find(f => f.name === 'flutter');
            expect(flutterFramework).toBeDefined();
            expect(flutterFramework?.category).toBe('mobile');
        });

        it('should calculate framework confidence correctly', async () => {
            const result = await service.detectTechnologies(mockRepositoryContent);

            // React should have high confidence due to package.json + file content + JSX files
            const reactFramework = result.frameworks.find(f => f.name === 'react');
            expect(reactFramework?.confidence).toBeGreaterThan(0.7);

            // Express should have high confidence due to package.json + file content
            const expressFramework = result.frameworks.find(f => f.name === 'express');
            expect(expressFramework?.confidence).toBeGreaterThan(0.7);
        });

        it('should detect databases from dependencies', async () => {
            const contentWithDatabase: RepositoryContent = {
                ...mockRepositoryContent,
                packageJson: {
                    ...mockRepositoryContent.packageJson,
                    dependencies: {
                        ...mockRepositoryContent.packageJson?.dependencies,
                        mongodb: '^4.0.0',
                        pg: '^8.0.0',
                    },
                },
            };

            const result = await service.detectTechnologies(contentWithDatabase);

            expect(result.databases).toContain('mongodb');
            expect(result.databases).toContain('postgresql');
        });

        it('should detect platforms from dependencies', async () => {
            const contentWithPlatforms: RepositoryContent = {
                ...mockRepositoryContent,
                packageJson: {
                    ...mockRepositoryContent.packageJson,
                    dependencies: {
                        ...mockRepositoryContent.packageJson?.dependencies,
                        'aws-sdk': '^2.0.0',
                        '@google-cloud/storage': '^6.0.0',
                    },
                },
            };

            const result = await service.detectTechnologies(contentWithPlatforms);

            expect(result.platforms).toContain('aws');
            expect(result.platforms).toContain('gcp');
        });

        it('should handle malformed package.json gracefully', async () => {
            const contentWithBadPackageJson: RepositoryContent = {
                ...mockRepositoryContent,
                files: [
                    ...mockRepositoryContent.files.filter(f => f.name !== 'package.json'),
                    {
                        path: 'package.json',
                        name: 'package.json',
                        extension: '.json',
                        size: 100,
                        content: '{ invalid json',
                    },
                ],
            };

            const result = await service.detectTechnologies(contentWithBadPackageJson);

            // Should still work, just without package.json analysis
            expect(result).toBeDefined();
            expect(result.languages).toBeDefined();
        });

        it('should sort languages by percentage', async () => {
            const result = await service.detectTechnologies(mockRepositoryContent);

            for (let i = 0; i < result.languages.length - 1; i++) {
                expect(result.languages[i].percentage).toBeGreaterThanOrEqual(
                    result.languages[i + 1].percentage
                );
            }
        });

        it('should sort frameworks by confidence', async () => {
            const result = await service.detectTechnologies(mockRepositoryContent);

            for (let i = 0; i < result.frameworks.length - 1; i++) {
                expect(result.frameworks[i].confidence).toBeGreaterThanOrEqual(
                    result.frameworks[i + 1].confidence
                );
            }
        });
    });

    describe('error handling', () => {
        it('should handle errors gracefully', async () => {
            const invalidContent = null as any;

            await expect(service.detectTechnologies(invalidContent)).rejects.toThrow();
        });
    });
});
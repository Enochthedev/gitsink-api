import { Test, TestingModule } from '@nestjs/testing';
import { ProjectCategorizationService } from './project-categorization.service';
import { RepositoryContent } from './interfaces/ai-enrichment.interface';

describe('ProjectCategorizationService', () => {
  let service: ProjectCategorizationService;

  const mockWebAppContent: RepositoryContent = {
    files: [
      {
        path: 'src/index.js',
        name: 'index.js',
        extension: '.js',
        size: 1024,
        content: 'const express = require("express");',
      },
      {
        path: 'src/components/App.jsx',
        name: 'App.jsx',
        extension: '.jsx',
        size: 2048,
        content: 'import React from "react";',
      },
      {
        path: 'package.json',
        name: 'package.json',
        extension: '.json',
        size: 512,
        content: JSON.stringify({
          dependencies: { react: '^18.0.0', express: '^4.18.0' },
        }),
      },
      {
        path: 'public/index.html',
        name: 'index.html',
        extension: '.html',
        size: 256,
        content: '<html><body><div id="root"></div></body></html>',
      },
    ],
    packageJson: {
      dependencies: { react: '^18.0.0', express: '^4.18.0' },
    },
    languages: { JavaScript: 3072, HTML: 256 },
    totalSize: 3840,
  };

  const mockMobileAppContent: RepositoryContent = {
    files: [
      {
        path: 'lib/main.dart',
        name: 'main.dart',
        extension: '.dart',
        size: 2048,
        content: 'import "package:flutter/material.dart";',
      },
      {
        path: 'pubspec.yaml',
        name: 'pubspec.yaml',
        extension: '.yaml',
        size: 512,
        content: 'dependencies:\n  flutter:\n    sdk: flutter',
      },
      {
        path: 'android/app/build.gradle',
        name: 'build.gradle',
        extension: '.gradle',
        size: 1024,
        content: 'android { compileSdkVersion 33 }',
      },
    ],
    languages: { Dart: 2048 },
    totalSize: 3584,
  };

  const mockDataScienceContent: RepositoryContent = {
    files: [
      {
        path: 'analysis.py',
        name: 'analysis.py',
        extension: '.py',
        size: 3072,
        content: 'import pandas as pd\nimport numpy as np\nimport tensorflow as tf',
      },
      {
        path: 'requirements.txt',
        name: 'requirements.txt',
        extension: '.txt',
        size: 256,
        content: 'pandas==1.5.0\nnumpy==1.24.0\ntensorflow==2.10.0',
      },
      {
        path: 'notebooks/exploration.ipynb',
        name: 'exploration.ipynb',
        extension: '.ipynb',
        size: 1024,
        content: '{"cells": []}',
      },
      {
        path: 'data/dataset.csv',
        name: 'dataset.csv',
        extension: '.csv',
        size: 2048,
        content: 'id,name,value\n1,test,100',
      },
    ],
    languages: { Python: 3072 },
    totalSize: 6400,
  };

  const mockAPIServiceContent: RepositoryContent = {
    files: [
      {
        path: 'src/server.js',
        name: 'server.js',
        extension: '.js',
        size: 2048,
        content: 'const express = require("express"); app.get("/api/users", handler);',
      },
      {
        path: 'src/routes/users.js',
        name: 'users.js',
        extension: '.js',
        size: 1024,
        content: 'router.get("/", getUsersHandler);',
      },
      {
        path: 'src/controllers/userController.js',
        name: 'userController.js',
        extension: '.js',
        size: 1536,
        content: 'exports.getUsers = async (req, res) => {};',
      },
    ],
    packageJson: {
      dependencies: { express: '^4.18.0', mongoose: '^6.0.0' },
    },
    languages: { JavaScript: 4608 },
    totalSize: 4608,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProjectCategorizationService],
    }).compile();

    service = module.get<ProjectCategorizationService>(ProjectCategorizationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('categorizeProject', () => {
    it('should categorize web application correctly', async () => {
      const result = await service.categorizeProject(mockWebAppContent);

      expect(result.primary).toBe('web-application');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.tags).toContain('web application');
      expect(result.tags).toContain('javascript');
    });

    it('should categorize mobile application correctly', async () => {
      const result = await service.categorizeProject(mockMobileAppContent);

      expect(result.primary).toBe('mobile-application');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.tags).toContain('mobile application');
      expect(result.tags).toContain('dart');
    });

    it('should categorize data science project correctly', async () => {
      const result = await service.categorizeProject(mockDataScienceContent);

      expect(result.primary).toBe('data-science');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.tags).toContain('data science');
      expect(result.tags).toContain('python');
    });

    it('should categorize API service correctly', async () => {
      const result = await service.categorizeProject(mockAPIServiceContent);

      expect(['api-service', 'web-application']).toContain(result.primary);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.tags.some(tag => ['api service', 'web application'].includes(tag))).toBe(true);
      expect(result.tags).toContain('javascript');
    });

    it('should detect machine learning projects', async () => {
      const mlContent: RepositoryContent = {
        files: [
          {
            path: 'model.py',
            name: 'model.py',
            extension: '.py',
            size: 2048,
            content: 'import tensorflow as tf\nimport keras\nfrom sklearn import datasets',
          },
          {
            path: 'train.py',
            name: 'train.py',
            extension: '.py',
            size: 1536,
            content: 'model.fit(X_train, y_train)',
          },
        ],
        languages: { Python: 3584 },
        totalSize: 3584,
      };

      const result = await service.categorizeProject(mlContent);

      expect(result.primary).toBe('machine-learning');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect CLI tools', async () => {
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
            path: 'src/commands/build.js',
            name: 'build.js',
            extension: '.js',
            size: 512,
            content: 'const commander = require("commander");',
          },
        ],
        packageJson: {
          dependencies: { commander: '^9.0.0' },
          bin: { 'my-cli': './bin/cli.js' },
        },
        languages: { JavaScript: 1536 },
        totalSize: 1536,
      };

      const result = await service.categorizeProject(cliContent);

      expect(result.primary).toBe('cli-tool');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect game projects', async () => {
      const gameContent: RepositoryContent = {
        files: [
          {
            path: 'Assets/Scripts/Player.cs',
            name: 'Player.cs',
            extension: '.cs',
            size: 2048,
            content: 'using UnityEngine; public class Player : MonoBehaviour',
          },
          {
            path: 'Assets/Scenes/MainScene.unity',
            name: 'MainScene.unity',
            extension: '.unity',
            size: 4096,
            content: 'Unity scene data',
          },
        ],
        languages: { 'C#': 2048 },
        totalSize: 6144,
      };

      const result = await service.categorizeProject(gameContent);

      expect(result.primary).toBe('game');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect DevOps projects', async () => {
      const devopsContent: RepositoryContent = {
        files: [
          {
            path: 'Dockerfile',
            name: 'Dockerfile',
            extension: '',
            size: 512,
            content: 'FROM node:16\nCOPY . .\nRUN npm install',
          },
          {
            path: 'docker-compose.yml',
            name: 'docker-compose.yml',
            extension: '.yml',
            size: 1024,
            content: 'version: "3"\nservices:\n  app:',
          },
          {
            path: '.github/workflows/ci.yml',
            name: 'ci.yml',
            extension: '.yml',
            size: 768,
            content: 'name: CI\non: [push]',
          },
          {
            path: 'terraform/main.tf',
            name: 'main.tf',
            extension: '.tf',
            size: 1536,
            content: 'resource "aws_instance" "web"',
          },
        ],
        languages: { HCL: 1536 },
        totalSize: 3840,
      };

      const result = await service.categorizeProject(devopsContent);

      expect(result.primary).toBe('devops');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect library projects', async () => {
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
            path: 'lib/helper.js',
            name: 'helper.js',
            extension: '.js',
            size: 512,
            content: 'exports.helper = () => {};',
          },
        ],
        packageJson: {
          name: 'utility-lib',
          main: 'src/index.js',
          dependencies: {},
        },
        languages: { JavaScript: 1536 },
        totalSize: 1536,
      };

      const result = await service.categorizeProject(libraryContent);

      expect(result.primary).toBe('library');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('should include secondary categories', async () => {
      const result = await service.categorizeProject(mockWebAppContent);

      expect(result.secondary).toBeDefined();
      expect(Array.isArray(result.secondary)).toBe(true);
      if (result.secondary) {
        expect(result.secondary.length).toBeGreaterThan(0);
      }
    });

    it('should generate appropriate tags', async () => {
      const result = await service.categorizeProject(mockWebAppContent);

      expect(result.tags).toContain('web application');
      expect(result.tags).toContain('javascript');
      expect(result.tags.some(tag => ['frontend', 'backend', 'fullstack'].includes(tag))).toBe(
        true,
      );
    });

    it('should apply language bonuses correctly', async () => {
      const pythonDataScienceContent: RepositoryContent = {
        ...mockDataScienceContent,
        languages: { Python: 4096 }, // High Python usage
      };

      const result = await service.categorizeProject(pythonDataScienceContent);

      expect(result.primary).toBe('data-science');
      expect(result.confidence).toBeGreaterThan(0.7); // Should have high confidence due to Python bonus
    });

    it('should detect complexity tags', async () => {
      const complexContent: RepositoryContent = {
        files: [
          ...Array(120)
            .fill(null)
            .map((_, i) => ({
              path: `src/file${i}.js`,
              name: `file${i}.js`,
              extension: '.js',
              size: 1024,
            })),
          {
            path: 'test/app.test.js',
            name: 'app.test.js',
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
          {
            path: '.github/workflows/ci.yml',
            name: 'ci.yml',
            extension: '.yml',
            size: 256,
            content: 'CI config',
          },
        ],
        languages: { JavaScript: 120 * 1024 },
        totalSize: 120 * 1024 + 1024,
      };

      const result = await service.categorizeProject(complexContent);

      expect(result.tags).toContain('enterprise');
      expect(result.tags).toContain('tested');
      expect(result.tags).toContain('containerized');
      expect(result.tags).toContain('ci-cd');
    });

    it('should handle empty repository content', async () => {
      const emptyContent: RepositoryContent = {
        files: [],
        languages: {},
        totalSize: 0,
      };

      const result = await service.categorizeProject(emptyContent);

      expect(result.primary).toBe('other');
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.tags).toContain('other');
    });

    it('should return default category for unrecognizable projects', async () => {
      const unknownContent: RepositoryContent = {
        files: [
          {
            path: 'random.xyz',
            name: 'random.xyz',
            extension: '.xyz',
            size: 100,
            content: 'unknown content',
          },
        ],
        languages: { Unknown: 100 },
        totalSize: 100,
      };

      const result = await service.categorizeProject(unknownContent);

      expect(result.primary).toBe('other');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should calculate confidence based on score distribution', async () => {
      // Content that clearly matches web-application category
      const clearWebAppContent: RepositoryContent = {
        files: [
          {
            path: 'src/App.jsx',
            name: 'App.jsx',
            extension: '.jsx',
            size: 2048,
            content: 'import React from "react"; export default App;',
          },
          {
            path: 'public/index.html',
            name: 'index.html',
            extension: '.html',
            size: 512,
            content: '<div id="root"></div>',
          },
        ],
        packageJson: {
          dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
        },
        languages: { JavaScript: 2048 },
        totalSize: 2560,
      };

      const result = await service.categorizeProject(clearWebAppContent);

      expect(result.confidence).toBeGreaterThan(0.7); // High confidence for clear match
    });

    it('should limit secondary categories to 3', async () => {
      const result = await service.categorizeProject(mockWebAppContent);

      expect(result.secondary?.length || 0).toBeLessThanOrEqual(3);
    });

    it('should limit tags to 10', async () => {
      const result = await service.categorizeProject(mockWebAppContent);

      expect(result.tags.length).toBeLessThanOrEqual(10);
    });

    it('should detect blockchain projects', async () => {
      const blockchainContent: RepositoryContent = {
        files: [
          {
            path: 'contracts/Token.sol',
            name: 'Token.sol',
            extension: '.sol',
            size: 2048,
            content: 'pragma solidity ^0.8.0; contract Token',
          },
          {
            path: 'hardhat.config.js',
            name: 'hardhat.config.js',
            extension: '.js',
            size: 512,
            content: 'require("@nomiclabs/hardhat-waffle");',
          },
        ],
        packageJson: {
          dependencies: { hardhat: '^2.0.0', web3: '^1.0.0' },
        },
        languages: { Solidity: 2048, JavaScript: 512 },
        totalSize: 2560,
      };

      const result = await service.categorizeProject(blockchainContent);

      expect(result.primary).toBe('blockchain');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should handle manual category override', async () => {
      const result = await service.categorizeProject(mockWebAppContent, {
        category: 'library',
        tags: ['custom-tag'],
      });

      expect(result.primary).toBe('library');
      expect(result.confidence).toBe(1.0); // High confidence for manual override
      expect(result.tags).toContain('custom-tag');
    });

    it('should reject invalid manual category override', async () => {
      const result = await service.categorizeProject(mockWebAppContent, {
        category: 'invalid-category',
      });

      // Should fall back to automatic categorization
      expect(result.primary).toBe('web-application');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect e-commerce projects', async () => {
      const ecommerceContent: RepositoryContent = {
        files: [
          {
            path: 'src/cart.js',
            name: 'cart.js',
            extension: '.js',
            size: 1024,
            content: 'class ShoppingCart { addProduct() {} }',
          },
          {
            path: 'src/payment.js',
            name: 'payment.js',
            extension: '.js',
            size: 512,
            content: 'function processPayment() {}',
          },
        ],
        packageJson: {
          dependencies: { stripe: '^8.0.0', 'shopping-cart': '^1.0.0' },
        },
        languages: { JavaScript: 1536 },
        totalSize: 1536,
      };

      const result = await service.categorizeProject(ecommerceContent);

      expect(result.primary).toBe('e-commerce');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect social media projects', async () => {
      const socialContent: RepositoryContent = {
        files: [
          {
            path: 'src/chat.js',
            name: 'chat.js',
            extension: '.js',
            size: 1024,
            content: 'class ChatRoom { sendMessage() {} }',
          },
          {
            path: 'src/post.js',
            name: 'post.js',
            extension: '.js',
            size: 512,
            content: 'function createPost() {}',
          },
        ],
        languages: { JavaScript: 1536 },
        totalSize: 1536,
      };

      const result = await service.categorizeProject(socialContent);

      expect(result.primary).toBe('social-media');
      expect(result.confidence).toBeGreaterThan(0.3);
    });
  });

  describe('utility methods', () => {
    it('should return available categories', () => {
      const categories = service.getAvailableCategories();

      expect(Array.isArray(categories)).toBe(true);
      expect(categories).toContain('web-application');
      expect(categories).toContain('mobile-application');
      expect(categories).toContain('data-science');
    });

    it('should return category hierarchy', () => {
      const hierarchy = service.getCategoryHierarchy();

      expect(typeof hierarchy).toBe('object');
      expect(hierarchy['web-application']).toContain('frontend');
      expect(hierarchy['mobile-application']).toContain('ios');
    });

    it('should filter projects by category', () => {
      const projects = [
        {
          id: 1,
          category: {
            primary: 'web-application',
            secondary: ['frontend'],
            tags: ['react'],
          },
        },
        {
          id: 2,
          category: {
            primary: 'mobile-application',
            secondary: ['ios'],
            tags: ['swift'],
          },
        },
        {
          id: 3,
          category: {
            primary: 'web-application',
            secondary: ['backend'],
            tags: ['node'],
          },
        },
      ];

      const webProjects = service.filterProjectsByCategory(projects, 'web-application');
      expect(webProjects).toHaveLength(2);
      expect(webProjects.map(p => p.id)).toEqual([1, 3]);

      const frontendProjects = service.filterProjectsByCategory(projects, undefined, ['frontend']);
      expect(frontendProjects).toHaveLength(1);
      expect(frontendProjects[0].id).toBe(1);

      const reactProjects = service.filterProjectsByCategory(projects, undefined, undefined, [
        'react',
      ]);
      expect(reactProjects).toHaveLength(1);
      expect(reactProjects[0].id).toBe(1);
    });

    it('should search projects by category terms', () => {
      const projects = [
        {
          id: 1,
          category: {
            primary: 'web-application',
            secondary: ['frontend'],
            tags: ['react'],
          },
        },
        {
          id: 2,
          category: {
            primary: 'mobile-application',
            secondary: ['ios'],
            tags: ['swift'],
          },
        },
        {
          id: 3,
          category: {
            primary: 'data-science',
            secondary: ['analytics'],
            tags: ['python'],
          },
        },
      ];

      const webResults = service.searchProjectsByCategory(projects, 'web');
      expect(webResults).toHaveLength(1);
      expect(webResults[0].id).toBe(1);

      const frontendResults = service.searchProjectsByCategory(projects, 'frontend');
      expect(frontendResults).toHaveLength(1);
      expect(frontendResults[0].id).toBe(1);

      const reactResults = service.searchProjectsByCategory(projects, 'react');
      expect(reactResults).toHaveLength(1);
      expect(reactResults[0].id).toBe(1);
    });

    it('should calculate category statistics', () => {
      const projects = [
        { category: { primary: 'web-application' } },
        { category: { primary: 'web-application' } },
        { category: { primary: 'mobile-application' } },
        { category: { primary: 'data-science' } },
      ];

      const stats = service.getCategoryStatistics(projects);

      expect(stats['web-application']).toBe(2);
      expect(stats['mobile-application']).toBe(1);
      expect(stats['data-science']).toBe(1);
    });

    it('should suggest similar categories', async () => {
      const suggestions = await service.suggestSimilarCategories(
        mockWebAppContent,
        'web-application',
        2,
      );

      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeLessThanOrEqual(2);
      expect(suggestions).not.toContain('web-application'); // Should not include current category
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully and return default category', async () => {
      const invalidContent = null as any;

      const result = await service.categorizeProject(invalidContent);
      expect(result.primary).toBe('other');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should handle malformed package.json', async () => {
      const contentWithBadPackageJson: RepositoryContent = {
        files: [
          {
            path: 'package.json',
            name: 'package.json',
            extension: '.json',
            size: 100,
            content: '{ invalid json',
          },
        ],
        packageJson: undefined,
        languages: {},
        totalSize: 100,
      };

      const result = await service.categorizeProject(contentWithBadPackageJson);

      expect(result).toBeDefined();
      expect(result.primary).toBe('other');
    });
  });
});

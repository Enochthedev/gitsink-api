import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SandboxRepository, SandboxUser } from './interfaces/sandbox.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SandboxDataService {
  private readonly logger = new Logger(SandboxDataService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate realistic test repository data
   */
  generateTestRepositories(count: number = 10): SandboxRepository[] {
    const repositories: SandboxRepository[] = [];
    const now = new Date();

    const sampleRepos = [
      {
        name: 'awesome-react-app',
        description: 'A modern React application with TypeScript and Tailwind CSS',
        language: 'TypeScript',
        topics: ['react', 'typescript', 'tailwindcss', 'frontend'],
        starCount: 42,
        forkCount: 8,
      },
      {
        name: 'node-api-server',
        description: 'RESTful API server built with Node.js and Express',
        language: 'JavaScript',
        topics: ['nodejs', 'express', 'api', 'backend'],
        starCount: 28,
        forkCount: 5,
      },
      {
        name: 'python-data-analysis',
        description: 'Data analysis toolkit using pandas and matplotlib',
        language: 'Python',
        topics: ['python', 'data-science', 'pandas', 'matplotlib'],
        starCount: 67,
        forkCount: 12,
      },
      {
        name: 'vue-dashboard',
        description: 'Admin dashboard built with Vue.js 3 and Composition API',
        language: 'Vue',
        topics: ['vue', 'dashboard', 'admin', 'composition-api'],
        starCount: 35,
        forkCount: 7,
      },
      {
        name: 'rust-cli-tool',
        description: 'Command-line utility written in Rust for file processing',
        language: 'Rust',
        topics: ['rust', 'cli', 'command-line', 'utility'],
        starCount: 19,
        forkCount: 3,
      },
      {
        name: 'go-microservice',
        description: 'Microservice architecture example using Go and Docker',
        language: 'Go',
        topics: ['go', 'microservices', 'docker', 'architecture'],
        starCount: 53,
        forkCount: 9,
      },
      {
        name: 'flutter-mobile-app',
        description: 'Cross-platform mobile app built with Flutter',
        language: 'Dart',
        topics: ['flutter', 'dart', 'mobile', 'cross-platform'],
        starCount: 31,
        forkCount: 6,
      },
      {
        name: 'java-spring-boot',
        description: 'Enterprise application using Spring Boot and JPA',
        language: 'Java',
        topics: ['java', 'spring-boot', 'jpa', 'enterprise'],
        starCount: 44,
        forkCount: 11,
      },
      {
        name: 'machine-learning-model',
        description: 'ML model for image classification using TensorFlow',
        language: 'Python',
        topics: ['machine-learning', 'tensorflow', 'image-classification', 'ai'],
        starCount: 89,
        forkCount: 15,
      },
      {
        name: 'blockchain-smart-contract',
        description: 'Smart contracts for decentralized applications',
        language: 'Solidity',
        topics: ['blockchain', 'smart-contracts', 'ethereum', 'defi'],
        starCount: 76,
        forkCount: 13,
      },
    ];

    for (let i = 0; i < Math.min(count, sampleRepos.length); i++) {
      const sample = sampleRepos[i];
      const id = uuidv4();
      const createdAt = new Date(now.getTime() - Math.random() * 365 * 24 * 60 * 60 * 1000);
      const updatedAt = new Date(
        createdAt.getTime() + Math.random() * (now.getTime() - createdAt.getTime()),
      );
      const pushedAt = new Date(updatedAt.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);

      repositories.push({
        id,
        name: sample.name,
        fullName: `sandbox-user/${sample.name}`,
        description: sample.description,
        htmlUrl: `https://github.com/sandbox-user/${sample.name}`,
        cloneUrl: `https://github.com/sandbox-user/${sample.name}.git`,
        defaultBranch: 'main',
        language: sample.language,
        topics: sample.topics,
        starCount: sample.starCount,
        forkCount: sample.forkCount,
        isPrivate: Math.random() < 0.2, // 20% private repos
        createdAt,
        updatedAt,
        pushedAt,
        platform: 'github',
        portfolioContent: this.generatePortfolioContent(sample),
        readmeContent: this.generateReadmeContent(sample),
        metadata: {
          sandbox: true,
          generated: true,
          templateType: 'realistic',
        },
      });
    }

    // Fill remaining slots with generated variations
    while (repositories.length < count) {
      const baseRepo = sampleRepos[Math.floor(Math.random() * sampleRepos.length)];
      const variation = this.generateRepoVariation(baseRepo, repositories.length);
      repositories.push(variation);
    }

    return repositories.slice(0, count);
  }

  /**
   * Generate test user data
   */
  generateTestUser(): SandboxUser {
    const usernames = [
      'sandbox-dev',
      'test-user',
      'demo-developer',
      'sample-coder',
      'example-user',
    ];
    const displayNames = [
      'Sandbox Developer',
      'Test User',
      'Demo Developer',
      'Sample Coder',
      'Example User',
    ];
    const bios = [
      'Full-stack developer passionate about clean code and user experience',
      'Software engineer with expertise in modern web technologies',
      'Open source contributor and technology enthusiast',
      'Building innovative solutions with cutting-edge technologies',
      'Passionate developer creating impactful software solutions',
    ];

    const index = Math.floor(Math.random() * usernames.length);
    const now = new Date();
    const createdAt = new Date(now.getTime() - Math.random() * 2 * 365 * 24 * 60 * 60 * 1000);

    return {
      id: uuidv4(),
      email: `${usernames[index]}@sandbox.example.com`,
      username: usernames[index],
      displayName: displayNames[index],
      avatar: `https://avatars.githubusercontent.com/u/${Math.floor(Math.random() * 100000)}?v=4`,
      bio: bios[index],
      location: 'Sandbox City, Virtual State',
      website: `https://${usernames[index]}.dev`,
      publicRepos: Math.floor(Math.random() * 50) + 5,
      followers: Math.floor(Math.random() * 200) + 10,
      following: Math.floor(Math.random() * 100) + 5,
      createdAt,
      metadata: {
        sandbox: true,
        generated: true,
        templateType: 'realistic',
      },
    };
  }

  /**
   * Create sandbox projects for a user
   */
  async createSandboxProjects(userId: string, repositories: SandboxRepository[]): Promise<void> {
    const projects = repositories.map(repo => ({
      id: uuidv4(),
      title: repo.name,
      description: repo.description,
      tags: repo.topics,
      repoUrl: repo.htmlUrl,
      category: this.categorizeProject(repo),
      language: repo.language,
      languages: { [repo.language]: 100 },
      starCount: repo.starCount,
      forkCount: repo.forkCount,
      isPrivate: repo.isPrivate,
      platform: repo.platform,
      platformId: repo.id,
      defaultBranch: repo.defaultBranch,
      topics: repo.topics,
      firstCommitAt: repo.createdAt,
      lastCommitAt: repo.pushedAt,
      pushedAt: repo.pushedAt,
      syncedAt: new Date(),
      published: true,
      featured: Math.random() < 0.3, // 30% featured
      githubSync: true,
      valid: true,
      validationErrors: [],
      collaborators: [],
      ownerId: userId,
      customMetadata: {
        sandbox: true,
        portfolioContent: repo.portfolioContent,
        readmeContent: repo.readmeContent,
        ...repo.metadata,
      },
      githubMetadata: {
        id: repo.id,
        node_id: `MDEwOlJlcG9zaXRvcnk${Math.floor(Math.random() * 1000000)}`,
        full_name: repo.fullName,
        html_url: repo.htmlUrl,
        clone_url: repo.cloneUrl,
        default_branch: repo.defaultBranch,
        language: repo.language,
        topics: repo.topics,
        stargazers_count: repo.starCount,
        forks_count: repo.forkCount,
        private: repo.isPrivate,
        created_at: repo.createdAt.toISOString(),
        updated_at: repo.updatedAt.toISOString(),
        pushed_at: repo.pushedAt.toISOString(),
      },
    }));

    // Insert projects in batches to avoid database limits
    const batchSize = 10;
    for (let i = 0; i < projects.length; i += batchSize) {
      const batch = projects.slice(i, i + batchSize);
      await this.prisma.project.createMany({
        data: batch,
        skipDuplicates: true,
      });
    }

    this.logger.log(`Created ${projects.length} sandbox projects for user ${userId}`);
  }

  /**
   * Create sandbox public profile for a user
   */
  async createSandboxProfile(userId: string, userData: SandboxUser): Promise<void> {
    const existingProfile = await this.prisma.publicProfile.findUnique({
      where: { userId },
    });

    if (existingProfile) {
      // Update existing profile with sandbox flag
      await this.prisma.publicProfile.update({
        where: { userId },
        data: {
          settings: {
            ...(existingProfile.settings as any),
            sandbox: true,
          },
        },
      });
    } else {
      // Create new sandbox profile
      await this.prisma.publicProfile.create({
        data: {
          userId,
          username: userData.username,
          displayName: userData.displayName,
          bio: userData.bio,
          avatar: userData.avatar,
          location: userData.location,
          website: userData.website,
          socialLinks: [
            {
              platform: 'github',
              url: `https://github.com/${userData.username}`,
            },
            {
              platform: 'twitter',
              url: `https://twitter.com/${userData.username}`,
            },
            {
              platform: 'linkedin',
              url: `https://linkedin.com/in/${userData.username}`,
            },
          ],
          theme: {
            primaryColor: '#3b82f6',
            backgroundColor: '#ffffff',
            textColor: '#1f2937',
            accentColor: '#10b981',
          },
          settings: {
            sandbox: true,
            showEmail: false,
            showStats: true,
            showPrivateRepos: false,
            featuredProjects: [],
          },
          isPublic: true,
          viewCount: Math.floor(Math.random() * 100),
        },
      });
    }

    this.logger.log(`Created sandbox profile for user ${userId}`);
  }

  /**
   * Clean up sandbox data for a user
   */
  async cleanupSandboxData(userId: string): Promise<void> {
    // Delete sandbox projects
    const deletedProjects = await this.prisma.project.deleteMany({
      where: {
        ownerId: userId,
        customMetadata: {
          path: ['sandbox'],
          equals: true,
        },
      },
    });

    // Remove sandbox flag from profile or delete if it was created in sandbox
    const profile = await this.prisma.publicProfile.findUnique({
      where: { userId },
    });

    if (profile && (profile.settings as any)?.sandbox) {
      await this.prisma.publicProfile.delete({
        where: { userId },
      });
    }

    this.logger.log(`Cleaned up sandbox data for user ${userId}`, {
      projectsDeleted: deletedProjects.count,
      profileDeleted: !!profile,
    });
  }

  // Private helper methods

  private generateRepoVariation(baseRepo: any, index: number): SandboxRepository {
    const id = uuidv4();
    const now = new Date();
    const createdAt = new Date(now.getTime() - Math.random() * 365 * 24 * 60 * 60 * 1000);
    const updatedAt = new Date(
      createdAt.getTime() + Math.random() * (now.getTime() - createdAt.getTime()),
    );
    const pushedAt = new Date(updatedAt.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);

    const variations = ['v2', 'pro', 'lite', 'beta', 'experimental'];
    const suffix = variations[index % variations.length];
    const name = `${baseRepo.name}-${suffix}`;

    return {
      id,
      name,
      fullName: `sandbox-user/${name}`,
      description: `${baseRepo.description} (${suffix} version)`,
      htmlUrl: `https://github.com/sandbox-user/${name}`,
      cloneUrl: `https://github.com/sandbox-user/${name}.git`,
      defaultBranch: 'main',
      language: baseRepo.language,
      topics: [...baseRepo.topics, suffix],
      starCount: Math.floor(baseRepo.starCount * (0.5 + Math.random() * 0.5)),
      forkCount: Math.floor(baseRepo.forkCount * (0.3 + Math.random() * 0.7)),
      isPrivate: Math.random() < 0.2,
      createdAt,
      updatedAt,
      pushedAt,
      platform: 'github',
      portfolioContent: this.generatePortfolioContent({ ...baseRepo, name }),
      readmeContent: this.generateReadmeContent({ ...baseRepo, name }),
      metadata: {
        sandbox: true,
        generated: true,
        templateType: 'variation',
        baseTemplate: baseRepo.name,
      },
    };
  }

  private generatePortfolioContent(repo: any): string {
    return `---
title: "${repo.name}"
description: "${repo.description}"
category: "${this.categorizeProject(repo)}"
tags: [${repo.topics.map((t: string) => `"${t}"`).join(', ')}]
featured: ${Math.random() < 0.3}
demo_url: "https://${repo.name}.demo.com"
tech_stack:
  - "${repo.language}"
  - "Git"
  - "GitHub"
highlights:
  - "Modern ${repo.language} implementation"
  - "Clean and maintainable code"
  - "Comprehensive documentation"
  - "Active development"
---

# ${repo.name}

${repo.description}

## Features

- ✨ Modern ${repo.language} implementation
- 🚀 High performance and scalability
- 📚 Comprehensive documentation
- 🧪 Extensive test coverage
- 🔧 Easy to configure and extend

## Tech Stack

- **Language**: ${repo.language}
- **Topics**: ${repo.topics.join(', ')}
- **Platform**: GitHub

## Getting Started

\`\`\`bash
git clone https://github.com/sandbox-user/${repo.name}.git
cd ${repo.name}
# Follow setup instructions in README.md
\`\`\`

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

## License

This project is licensed under the MIT License.
`;
  }

  private generateReadmeContent(repo: any): string {
    return `# ${repo.name}

${repo.description}

## 🚀 Quick Start

\`\`\`bash
git clone https://github.com/sandbox-user/${repo.name}.git
cd ${repo.name}
\`\`\`

## 📋 Prerequisites

- ${repo.language} runtime environment
- Git for version control
- Your favorite code editor

## 🛠️ Installation

1. Clone the repository
2. Install dependencies
3. Configure environment variables
4. Run the application

## 🧪 Testing

\`\`\`bash
# Run tests
npm test
\`\`\`

## 📖 Documentation

For detailed documentation, please visit our [docs](./docs) folder.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⭐ Show your support

Give a ⭐️ if this project helped you!

---

**Note**: This is a sandbox/demo repository created for testing purposes.
`;
  }

  private categorizeProject(repo: SandboxRepository): string {
    const language = repo.language.toLowerCase();
    const topics = repo.topics.map(t => t.toLowerCase());

    if (
      topics.includes('frontend') ||
      topics.includes('react') ||
      topics.includes('vue') ||
      topics.includes('angular')
    ) {
      return 'Frontend';
    }
    if (topics.includes('backend') || topics.includes('api') || topics.includes('server')) {
      return 'Backend';
    }
    if (
      topics.includes('mobile') ||
      topics.includes('flutter') ||
      topics.includes('react-native')
    ) {
      return 'Mobile';
    }
    if (
      topics.includes('data-science') ||
      topics.includes('machine-learning') ||
      topics.includes('ai')
    ) {
      return 'Data Science';
    }
    if (topics.includes('cli') || topics.includes('command-line') || topics.includes('utility')) {
      return 'Tools';
    }
    if (topics.includes('blockchain') || topics.includes('smart-contracts')) {
      return 'Blockchain';
    }

    // Categorize by language
    switch (language) {
      case 'javascript':
      case 'typescript':
        return 'Web Development';
      case 'python':
        return 'Data Science';
      case 'java':
      case 'kotlin':
        return 'Enterprise';
      case 'rust':
      case 'go':
        return 'Systems';
      case 'dart':
        return 'Mobile';
      default:
        return 'Other';
    }
  }
}

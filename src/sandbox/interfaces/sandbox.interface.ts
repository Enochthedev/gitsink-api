export interface SandboxConfig {
  enabled: boolean;
  maxProjects: number;
  maxApiCalls: number;
  maxSyncOperations: number;
  sessionDuration: number; // in milliseconds
  dataRetention: number; // in milliseconds
}

export interface SandboxSession {
  id: string;
  userId: string;
  startedAt: Date;
  expiresAt: Date;
  projectCount: number;
  apiCallCount: number;
  syncOperationCount: number;
  isActive: boolean;
  metadata: Record<string, any>;
}

export interface SandboxUsage {
  projectsUsed: number;
  maxProjects: number;
  apiCallsUsed: number;
  maxApiCalls: number;
  syncOperationsUsed: number;
  maxSyncOperations: number;
  sessionTimeRemaining: number;
}

export interface SandboxRepository {
  id: string;
  name: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
  language: string;
  topics: string[];
  starCount: number;
  forkCount: number;
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
  pushedAt: Date;
  platform: 'github' | 'gitlab' | 'bitbucket';
  portfolioContent?: string;
  readmeContent?: string;
  metadata: Record<string, any>;
}

export interface SandboxUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatar: string;
  bio: string;
  location: string;
  website: string;
  publicRepos: number;
  followers: number;
  following: number;
  createdAt: Date;
  metadata: Record<string, any>;
}

export interface SandboxMigrationOptions {
  includeProjects: boolean;
  includeProfile: boolean;
  includeSettings: boolean;
  overwriteExisting: boolean;
}

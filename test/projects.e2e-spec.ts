import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

class MockPrismaService {
  projects: any[] = [];
  users: any[] = [];
  project = {
    upsert: jest.fn(async ({ where, create, update }) => {
      const idx = this.projects.findIndex(
        (p) =>
          p.ownerId === where.ownerId_repoUrl.ownerId &&
          p.repoUrl === where.ownerId_repoUrl.repoUrl,
      );
      if (idx > -1) {
        this.projects[idx] = { ...this.projects[idx], ...update };
        return this.projects[idx];
      }
      const proj = { id: `p${this.projects.length + 1}`, ...create };
      this.projects.push(proj);
      return proj;
    }),
    findMany: jest.fn(async ({ where }) =>
      this.projects.filter((p) => p.ownerId === where.ownerId),
    ),
    findUnique: jest.fn(async ({ where }) =>
      this.projects.find(
        (p) =>
          p.ownerId === where.ownerId_repoUrl.ownerId &&
          p.repoUrl === where.ownerId_repoUrl.repoUrl,
      ) || null,
    ),
  };
  user = {
    findFirst: jest.fn(async ({ where }) =>
      this.users.find((u) => u.apiKey === where.apiKey) || null,
    ),
    update: jest.fn(async ({ where, data }) => {
      const user = this.users.find((u) => u.id === where.id);
      Object.assign(user, data);
      return user;
    }),
    upsert: jest.fn(async ({ where, create, update }) => {
      const idx = this.users.findIndex((u) => u.githubId === where.githubId);
      if (idx > -1) {
        this.users[idx] = { ...this.users[idx], ...update };
        return this.users[idx];
      }
      const user = { id: `u${this.users.length + 1}`, ...create };
      this.users.push(user);
      return user;
    }),
  };
  $connect = jest.fn();
  $disconnect = jest.fn();
}

describe('Projects Module (e2e)', () => {
  let app: INestApplication;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    prisma = new MockPrismaService();
    prisma.users.push({
      id: 'u1',
      email: 'test@example.com',
      apiKey: 'valid-key',
      githubId: null,
      createdAt: new Date(),
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => {
          const map: Record<string, string> = {
            GITHUB_API_BASE: 'https://api.github.com/repos',
            GITHUB_MD_URL: 'https://raw.githubusercontent.com',
            GITHUB_CLIENT_ID: 'client',
            GITHUB_CLIENT_SECRET: 'secret',
          };
          return map[key];
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('blocks requests without API key', async () => {
    await request(app.getHttpServer()).get('/projects').expect(401);
  });

  it('syncs a project via REST and retrieves it', async () => {
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (url.includes('/repos/')) {
        return { data: { name: 'Repo', description: 'Desc', pushed_at: new Date().toISOString() } } as any;
      }
      return { data: '# Title\n'} as any;
    });

    await request(app.getHttpServer())
      .post('/projects/sync')
      .set('x-api-key', 'valid-key')
      .send({ repoUrl: 'https://github.com/test/repo', branch: 'main' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/projects')
      .set('x-api-key', 'valid-key')
      .expect(200);

    expect(res.body.length).toBe(1);
  });

  it('GraphQL projects query returns data', async () => {
    const query = {
      query: '{ projects { id } }',
    };
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .set('x-api-key', 'valid-key')
      .send(query)
      .expect(200);
    expect(res.body.data.projects).toEqual([]);
  });

  it('handles GitHub OAuth flow', async () => {
    mockedAxios.post.mockResolvedValue({ data: { access_token: 'token' } });
    mockedAxios.get.mockResolvedValue({ data: { id: 123 } });
    const mutation = {
      query: 'mutation($userId:String!,$code:String!){ githubOAuth(userId:$userId, code:$code){ id githubId } }',
      variables: { userId: 'u1', code: 'code123' },
    };
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send(mutation)
      .expect(200);
    expect(res.body.data.githubOAuth.githubId).toBe('123');
  });
});

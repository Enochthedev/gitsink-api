import { Injectable } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ProjectsService } from './projects.service';

@Injectable()
export class SyncQueueService {
  private queue: Queue;

  constructor(
    private readonly config: ConfigService,
    private readonly projectsService: ProjectsService,
  ) {
    this.queue = new Queue('sync', {
      connection: { url: this.config.get<string>('REDIS_URL') },
    });

    new Worker(
      'sync',
      async (job) => {
        const { userId, repoUrl, branch } = job.data;
        await this.projectsService.syncProjectFromGitHub(userId, repoUrl, branch);
      },
      { connection: { url: this.config.get<string>('REDIS_URL') } },
    );
  }

  async addJob(userId: string, repoUrl: string, branch?: string) {
    await this.queue.add(
      'sync',
      { userId, repoUrl, branch },
      { jobId: `${userId}:${repoUrl}` },
    );
  }
}

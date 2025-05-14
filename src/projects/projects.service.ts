import { Injectable } from '@nestjs/common';
import { Project } from './entities/project.entity';

@Injectable()
export class ProjectsService {
  findAll(): Project[] {
    return [
      {
        id: '1',
        title: 'Onchain Watch',
        description: 'A scam detection tool',
        tags: ['web3', 'degen'],
        demoUrl: 'https://onchain.watch',
        repoUrl: 'https://github.com/user/repo',
        featured: true,
        published: true,
      },
    ];
  }
}

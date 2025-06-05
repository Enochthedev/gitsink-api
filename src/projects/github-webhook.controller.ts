import { Body, Controller, Post } from '@nestjs/common';
import { ProjectsService } from './projects.service';

@Controller('webhook/github')
export class GitHubWebhookController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  async handleWebhook(@Body() body: any): Promise<{ success: boolean }> {
    const repoUrl: string | undefined = body?.repository?.html_url;
    const ref: string | undefined = body?.ref;
    const branch = ref?.split('/').pop() ?? 'main';
    if (repoUrl) {
      await this.projectsService.syncProjectFromGitHub(
        repoUrl,
        branch,
        'mock-user-id',
      );
    }
    return { success: true };
  }
}

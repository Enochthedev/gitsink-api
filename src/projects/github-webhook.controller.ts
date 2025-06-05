import { Body, Controller, Post } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ConfigService } from '@nestjs/config';

@Controller('webhook/github')
export class GitHubWebhookController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  async handleWebhook(@Body() body: any): Promise<{ success: boolean }> {
    const repoUrl: string | undefined = body?.repository?.html_url;
    const ref: string | undefined = body?.ref;
    const branch = ref?.split('/').pop() ?? 'main';
    if (repoUrl) {
      // Associate webhook-triggered syncs with a configured user
      const ownerId = this.config.get<string>(
        'WEBHOOK_USER_ID',
        'webhook-user',
      );
      await this.projectsService.syncProjectFromGitHub(
        ownerId,
        repoUrl,
        branch,
      );
    }
    return { success: true };
  }
}

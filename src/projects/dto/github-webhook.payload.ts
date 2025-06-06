import { ApiProperty } from '@nestjs/swagger';

export class GitHubWebhookPayload {
  @ApiProperty({ example: { html_url: 'https://github.com/owner/repo' } })
  repository!: { html_url: string };

  @ApiProperty({ example: 'refs/heads/main' })
  ref!: string;
}

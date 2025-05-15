export interface GitHubRepo {
  name: string;
  description: string | null;
  pushed_at: string;
  contributors_url?: string;
  [key: string]: unknown; // allow extra GitHub fields
}

export function parseGitHubRepoUrl(url: string): {
  owner: string;
  repo: string;
} {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error('Invalid GitHub repo URL');
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

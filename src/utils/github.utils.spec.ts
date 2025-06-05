import { parseGitHubRepoUrl } from './github.utils';

describe('parseGitHubRepoUrl', () => {
  it('parses https URLs without .git', () => {
    expect(parseGitHubRepoUrl('https://github.com/foo/bar')).toEqual({
      owner: 'foo',
      repo: 'bar',
    });
  });

  it('parses https URLs with .git', () => {
    expect(parseGitHubRepoUrl('https://github.com/foo/bar.git')).toEqual({
      owner: 'foo',
      repo: 'bar',
    });
  });

  it('throws for invalid URLs', () => {
    expect(() => parseGitHubRepoUrl('https://example.com/foo/bar')).toThrow();
  });
});

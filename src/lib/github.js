// Minimal GitHub REST API v3 client. Works in browser and Node 18+ (global fetch).
// Token is held in the instance only — never persisted.

const API = 'https://api.github.com';

export function parseRepoUrl(input) {
  // Accepts "owner/repo", full URL, or with .git / trailing slash.
  const cleaned = input.trim().replace(/\.git$/, '').replace(/\/$/, '');
  const m = cleaned.match(/(?:github\.com[/:])?([^/\s]+)\/([^/\s]+)$/);
  if (!m) throw new Error(`Could not parse repo from "${input}"`);
  return { owner: m[1], repo: m[2] };
}

export class GitHub {
  constructor(token) {
    if (!token) throw new Error('GitHub token is required');
    this.token = token;
  }

  async #req(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Authorization: `token ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...options.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub ${res.status} on ${path}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  getRepo(owner, repo) {
    return this.#req(`/repos/${owner}/${repo}`);
  }

  /** Recursive file tree for a branch. Returns blob nodes: { path, size }. */
  async getTree(owner, repo, branch) {
    const data = await this.#req(
      `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
    );
    if (data.truncated) {
      console.warn('Tree truncated by GitHub — large repo, file list is partial.');
    }
    return data.tree
      .filter((n) => n.type === 'blob')
      .map((n) => ({ path: n.path, size: n.size || 0 }));
  }

  /** Returns { content: string, sha: string } — sha is needed to update the file. */
  async getFile(owner, repo, path) {
    const data = await this.#req(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`
    );
    const content =
      typeof atob === 'function'
        ? decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))))
        : Buffer.from(data.content, 'base64').toString('utf-8');
    return { content, sha: data.sha };
  }

  /** Best-effort read; returns null if the file doesn't exist (404). */
  async tryGetFile(owner, repo, path) {
    try {
      return await this.getFile(owner, repo, path);
    } catch (e) {
      if (String(e).includes('404')) return null;
      throw e;
    }
  }

  /** Create or update a file. Pass existing sha to update; omit to create. */
  putFile(owner, repo, path, content, message, sha) {
    const encoded =
      typeof btoa === 'function'
        ? btoa(unescape(encodeURIComponent(content)))
        : Buffer.from(content, 'utf-8').toString('base64');
    return this.#req(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`,
      {
        method: 'PUT',
        body: JSON.stringify({ message, content: encoded, ...(sha ? { sha } : {}) }),
      }
    );
  }

  /**
   * Commit several files in ONE commit via the Git Data API — atomic (all or
   * nothing) and a single clean commit, instead of one PUT (and commit) per file.
   * Handles create and update uniformly; no per-file SHA needed.
   * @param {{path:string, content:string}[]} files
   * @returns {Promise<string>} new commit sha
   */
  async commitFiles(owner, repo, branch, files, message) {
    const base = `/repos/${owner}/${repo}`;
    const br = await this.#req(`${base}/branches/${branch}`);
    const headSha = br.commit.sha;
    const baseTreeSha = br.commit.commit.tree.sha;

    const tree = await this.#req(`${base}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: files.map((f) => ({
          path: f.path,
          mode: '100644',
          type: 'blob',
          content: f.content,
        })),
      }),
    });

    const commit = await this.#req(`${base}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({ message, tree: tree.sha, parents: [headSha] }),
    });

    await this.#req(`${base}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha }),
    });

    return commit.sha;
  }
}

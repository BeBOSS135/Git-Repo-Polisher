// Verifies the core pipeline without the UI.
//   node scripts/test-core.mjs <owner/repo> [branch]
// Env: GITHUB_TOKEN (required for the live repo test). Ollama test runs if it's up.

import { GitHub, parseRepoUrl } from '../src/lib/github.js';
import { isUp, listModels, generate } from '../src/lib/ollama.js';
import { detectStack } from '../src/lib/detectStack.js';
import { buildGitignore, buildLicense, buildCI } from '../src/lib/generators.js';

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);

// 1. detectStack — pure, no deps
console.log('\n[1] detectStack');
const sample = ['app.py', 'utils/io.py', 'web/index.js', 'web/app.jsx', 'package.json', 'README.md'];
const det = detectStack(sample);
console.log('   ', JSON.stringify(det));
det.stacks.includes('python') && det.stacks.includes('node')
  ? ok('multi-stack detected (python + node)')
  : bad('expected both python and node');

// 2. templates
console.log('\n[2] templates');
ok(`gitignore (${buildGitignore(det.stacks).split('\n').filter(Boolean).length} lines)`);
ok(`license (${buildLicense('Test Author').length} chars)`);
ok(`ci for "${det.primary}" (${buildCI(det.primary).split('\n').length} lines)`);

// 3. Ollama
console.log('\n[3] Ollama');
if (await isUp()) {
  ok('reachable at localhost:11434');
  console.log('    models:', (await listModels()).join(', ') || '(none)');
  const out = await generate('Reply with exactly the word: pong', { temperature: 0 });
  console.log('    sample response:', JSON.stringify(out.slice(0, 60)));
} else {
  bad('not reachable — run `ollama serve` (this is fine for now)');
}

// 4. GitHub (only if token + repo arg provided)
console.log('\n[4] GitHub');
const repoArg = process.argv[2];
const token = process.env.GITHUB_TOKEN;
if (repoArg && token) {
  const { owner, repo } = parseRepoUrl(repoArg);
  const gh = new GitHub(token);
  const meta = await gh.getRepo(owner, repo);
  ok(`repo ${owner}/${repo} — default branch "${meta.default_branch}"`);
  const tree = await gh.getTree(owner, repo, meta.default_branch);
  const paths = tree.map((n) => n.path);
  ok(`tree: ${paths.length} files`);
  console.log('    detected:', JSON.stringify(detectStack(paths)));
} else {
  console.log('    skipped — pass <owner/repo> and set GITHUB_TOKEN to run live test');
}

console.log('\ndone.\n');

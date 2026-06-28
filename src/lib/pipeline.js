// Orchestrates the full flow: analyse a repo, then generate the 5 files.
// Kept UI-free so it can be driven from a script or React equally.

import { detectStack } from './detectStack.js';
import { generate } from './ollama.js';
import {
  buildGitignore,
  buildLicense,
  buildCI,
  buildReadmePrompt,
  buildDepsReport,
  sanitizeMarkdown,
} from './generators.js';
import { extractPythonPackages, localModulesFromTree } from './pyImports.js';
import { fetchLatestVersions } from './pypi.js';
import { buildSuggestions } from './suggestions.js';

const SOURCE_EXT = {
  python: ['py'],
  node: ['js', 'jsx', 'ts', 'tsx', 'mjs'],
  java: ['java'],
  go: ['go'],
  rust: ['rs'],
};
const MANIFEST = {
  python: 'requirements.txt',
  node: 'package.json',
  rust: 'Cargo.toml',
  go: 'go.mod',
};

const extOf = (p) => {
  const b = p.split('/').pop();
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1).toLowerCase() : '';
};

function scanImports(content, stack) {
  const lines = content.split('\n');
  const out = [];
  for (const line of lines) {
    if (stack === 'python' && /^\s*(import|from)\s+\w/.test(line)) out.push(line.trim());
    if (stack === 'node' && /(import\s.+from\s|require\()/.test(line)) out.push(line.trim());
  }
  return out;
}

// Likely entry points — these describe the project best, so rank them first.
const ENTRY_NAMES = ['main', 'app', 'index', '__main__', 'cli', 'server', 'run', 'train'];

// Import roots / file extensions that mark a machine-learning or data project.
const ML_PACKAGES = new Set([
  'tensorflow', 'keras', 'torch', 'sklearn', 'scikit-learn', 'xgboost', 'lightgbm',
  'numpy', 'pandas', 'scipy', 'transformers', 'cv2', 'matplotlib', 'seaborn',
]);
const DATA_EXT = /\.(csv|tsv|npz|npy|h5|hdf5|parquet|pkl|json|ipynb)$/i;

function isMLProject(analysis) {
  const usesMLLib = [...analysis.imports].some((line) =>
    [...ML_PACKAGES].some((p) => line.includes(p))
  );
  const hasData = analysis.fileList.some((p) => DATA_EXT.test(p));
  return usesMLLib || hasData;
}

// Deterministically pull dataset references out of source so the README's Dataset
// section is grounded, not invented. Returns short evidence strings.
function extractDatasetRefs(mainFiles, fileList) {
  const refs = new Set();
  const patterns = [
    /\b(?:read_csv|read_parquet|read_json|read_excel)\(\s*([^)]+)\)/g,
    /\bnp\.(?:load|loadtxt|genfromtxt)\(\s*([^)]+)\)/g,
    /\b(?:load_data|fetch_openml|load_dataset)\(\s*([^)]*)\)/g,
    /\bflow_from_directory\(\s*([^)]+)\)/g,
    /['"]([^'"]+\.(?:csv|tsv|npz|npy|h5|hdf5|parquet|json))['"]/gi,
  ];
  for (const f of mainFiles) {
    for (const re of patterns) {
      let m;
      while ((m = re.exec(f.content))) {
        refs.add(m[0].trim().slice(0, 120));
      }
    }
  }
  // Also note committed data files in the tree.
  fileList.filter((p) => DATA_EXT.test(p)).slice(0, 10).forEach((p) => refs.add(`file: ${p}`));
  return [...refs].slice(0, 15);
}

/** Rank source files so README context favours entry points and substantial files. */
function pickSourceFiles(tree, primary, limit = 5) {
  const exts = SOURCE_EXT[primary] || [];
  const score = (node) => {
    const base = node.path.split('/').pop().toLowerCase().replace(/\.\w+$/, '');
    let s = node.size; // larger files usually carry more signal
    if (ENTRY_NAMES.includes(base)) s += 1_000_000; // entry points dominate
    if (!node.path.includes('/')) s += 100_000; // top-level over deeply nested
    return s;
  };
  return tree
    .filter((n) => exts.includes(extOf(n.path)) && !n.path.toLowerCase().includes('test'))
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit)
    .map((n) => n.path);
}

/**
 * Read enough of the repo to generate good files.
 * @param {GitHub} gh
 * @returns analysis object
 */
export async function analyseRepo(gh, owner, repo, onProgress = () => {}) {
  onProgress('Fetching repo metadata…');
  const meta = await gh.getRepo(owner, repo);
  const branch = meta.default_branch;

  onProgress('Fetching file tree…');
  const tree = await gh.getTree(owner, repo, branch); // [{ path, size }]
  const fileList = tree.map((n) => n.path);
  const fileSizes = Object.fromEntries(tree.map((n) => [n.path, n.size]));
  const { stacks, primary, counts } = detectStack(fileList);

  const sourcePaths = pickSourceFiles(tree, primary);
  const manifestPath = MANIFEST[primary];

  // One parallel batch: read source files + probe README/manifest. All independent.
  onProgress(`Reading ${sourcePaths.length} source file(s) + README/manifest…`);
  const [readFiles, readmeUpper, readmeLower, manifestFile] = await Promise.all([
    Promise.all(sourcePaths.map((p) => gh.tryGetFile(owner, repo, p))),
    gh.tryGetFile(owner, repo, 'README.md'),
    gh.tryGetFile(owner, repo, 'readme.md'),
    manifestPath ? gh.tryGetFile(owner, repo, manifestPath) : Promise.resolve(null),
  ]);

  const mainFiles = [];
  const imports = new Set();
  sourcePaths.forEach((path, i) => {
    const f = readFiles[i];
    if (!f) return;
    mainFiles.push({ path, content: f.content });
    scanImports(f.content, primary).forEach((x) => imports.add(x));
  });

  const readme = readmeUpper
    ? { ...readmeUpper, path: 'README.md' }
    : readmeLower
    ? { ...readmeLower, path: 'readme.md' }
    : null;

  return {
    owner, repo, branch, repoName: repo,
    fileList, fileSizes, stacks, primary, counts,
    mainFiles,
    imports: [...imports],
    existingReadme: readme,
    manifest: manifestFile ? { path: manifestPath, ...manifestFile } : null,
    author: meta.owner?.login || owner,
  };
}

/**
 * Generate all 5 files from an analysis.
 * Returns an array of { id, label, path, content, llm, sha } ready for preview/push.
 * `sha` is set when the file already exists (needed to update on push).
 */
export async function generateFiles(analysis, opts = {}) {
  // Code-specialised model: better README/dep reasoning than general Mistral, same VRAM.
  const { model = 'qwen2.5-coder:7b', onProgress = () => {} } = opts;
  const { stacks, primary } = analysis;

  // Deterministic files first — instant.
  const files = [
    {
      id: 'readme', label: 'README.md', path: 'README.md', llm: true,
      content: '', sha: analysis.existingReadme?.sha,
    },
    {
      id: 'gitignore', label: '.gitignore', path: '.gitignore', llm: false,
      content: buildGitignore(stacks), sha: undefined,
    },
    {
      id: 'license', label: 'LICENSE', path: 'LICENSE', llm: false,
      content: buildLicense(analysis.author), sha: undefined,
    },
    {
      id: 'ci', label: 'CI workflow', path: '.github/workflows/ci.yml', llm: false,
      content: buildCI(primary), sha: undefined,
    },
    {
      id: 'deps', label: 'Dependency report', path: 'DEPENDENCIES.md', llm: false,
      content: '', sha: undefined, advisory: true,
    },
    {
      id: 'suggestions', label: 'Suggestions', path: 'SUGGESTIONS.md', llm: false,
      content: buildSuggestions(analysis), sha: undefined, advisory: true,
    },
  ];

  // Third-party packages (stdlib + local modules stripped) — used by both the
  // requirements.txt file and the dependency report, so stdlib can't leak in.
  const packages =
    primary === 'python'
      ? extractPythonPackages(analysis.imports, localModulesFromTree(analysis.fileList))
      : [];

  // requirements.txt — only when a Python repo has no manifest yet.
  const needsRequirements =
    primary === 'python' && !analysis.manifest && packages.length > 0;
  if (needsRequirements) {
    files.splice(1, 0, {
      id: 'requirements', label: 'requirements.txt', path: 'requirements.txt',
      llm: false, content: packages.join('\n') + '\n', sha: undefined,
    });
  }

  const isML = isMLProject(analysis);
  const datasetRefs = isML ? extractDatasetRefs(analysis.mainFiles, analysis.fileList) : [];

  // LLM files — README then deps. Output sanitised to strip fences/preamble.
  onProgress('Generating README (LLM)…');
  const readme = files.find((f) => f.id === 'readme');
  readme.content = sanitizeMarkdown(
    await generate(
      buildReadmePrompt({
        repoName: analysis.repoName,
        stacks: analysis.stacks,
        fileList: analysis.fileList,
        mainFiles: analysis.mainFiles,
        existingReadme: analysis.existingReadme?.content,
        isML,
        datasetRefs,
      }),
      { model }
    )
  );

  // Dependency report — fully deterministic (set arithmetic + real PyPI pins).
  onProgress('Building dependency report…');
  const deps = files.find((f) => f.id === 'deps');
  if (primary === 'python') {
    const latestVersions = packages.length ? await fetchLatestVersions(packages) : {};
    deps.content = buildDepsReport({
      packages,
      manifest: analysis.manifest?.content,
      manifestPath: analysis.manifest?.path || MANIFEST.python,
      latestVersions,
    });
  } else {
    deps.content =
      '# Dependency report\n\nAutomated dependency analysis currently supports Python projects.\n';
  }

  return files;
}

const WORKFLOW_DIR = '.github/workflows/';

/**
 * Push selected files as ONE atomic commit. `files` = array of { path, content }.
 * Writing under .github/workflows/ needs the token's separate "Workflows" permission;
 * if that's missing the whole atomic commit 403s, so we fall back to committing
 * everything else and report what was skipped.
 * Returns { commit, paths, skipped, skipReason }.
 */
export async function pushFiles(
  gh, owner, repo, branch, files,
  message = 'chore: add project docs & config via GitHub Repo Polisher'
) {
  const slim = files.map((f) => ({ path: f.path, content: f.content }));
  const workflowPaths = slim.filter((f) => f.path.startsWith(WORKFLOW_DIR)).map((f) => f.path);

  try {
    const commit = await gh.commitFiles(owner, repo, branch, slim, message);
    return { commit, paths: slim.map((f) => f.path), skipped: [] };
  } catch (e) {
    if (workflowPaths.length && String(e).includes('403')) {
      const rest = slim.filter((f) => !f.path.startsWith(WORKFLOW_DIR));
      const commit = await gh.commitFiles(owner, repo, branch, rest, message);
      return {
        commit,
        paths: rest.map((f) => f.path),
        skipped: workflowPaths,
        skipReason:
          'Your token lacks the "Workflows" permission. Add Workflows → Read and write to push CI workflow files.',
      };
    }
    throw e;
  }
}

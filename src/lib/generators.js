// Generators for the 5 files.
// Deterministic templates: .gitignore, LICENSE, ci.yml  (exact-format, no LLM guessing)
// LLM-driven prompt builders:  README.md, dependency cleanup

// ---------------------------------------------------------------------------
// 1. .gitignore — per-stack templates, merged for multi-stack repos
// ---------------------------------------------------------------------------
const GITIGNORE = {
  python: ['__pycache__/', '*.pyc', '.env', 'venv/', '.venv/', '*.egg-info/', '.pytest_cache/'],
  node:   ['node_modules/', '.env', 'dist/', 'build/', '.next/', 'npm-debug.log*'],
  java:   ['target/', '*.class', '.env', '.idea/', '*.iml'],
  go:     ['/bin/', '*.exe', '.env'],
  rust:   ['/target/', '.env'],
};
const GITIGNORE_COMMON = ['.DS_Store', 'Thumbs.db', '*.log'];

export function buildGitignore(stacks) {
  const lines = new Set(GITIGNORE_COMMON);
  for (const s of stacks) (GITIGNORE[s] || []).forEach((l) => lines.add(l));
  return [...lines].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// 2. LICENSE — MIT
// ---------------------------------------------------------------------------
export function buildLicense(author, year = new Date().getFullYear()) {
  return `MIT License

Copyright (c) ${year} ${author}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}

// ---------------------------------------------------------------------------
// 3. CI workflow — per primary stack
// ---------------------------------------------------------------------------
const CI = {
  python: `name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
      - run: pip install flake8 pytest
      - run: flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
      - run: pytest || echo "no tests yet"
`,
  node: `name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint --if-present
      - run: npm test --if-present
`,
};

export function buildCI(primary) {
  return CI[primary] || CI.node; // node template is a reasonable generic default
}

/**
 * Clean up LLM output: strip a wrapping code fence and conversational preamble
 * that small models sometimes add despite "output only…" instructions.
 */
export function sanitizeMarkdown(text) {
  let t = text.trim();
  const fence = t.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
  if (fence) t = fence[1].trim();
  t = t.replace(/^(?:sure[,!]?\s*)?here(?:'s| is)\b[^\n]*:?\s*\n+/i, '');
  return t.trim() + '\n';
}

// ---------------------------------------------------------------------------
// 4. README — LLM prompt
// ---------------------------------------------------------------------------
export function buildReadmePrompt({
  repoName, stacks, fileList, mainFiles, existingReadme,
  manifest, runCommand, isML = false, datasetRefs = [],
}) {
  const tree = fileList.slice(0, 60).join('\n');
  const code = mainFiles
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 1500)}`)
    .join('\n\n');

  const improve = existingReadme
    ? `\nAn existing README is below. IMPROVE it — keep any custom sections the author wrote, fix gaps. Do not discard their work.\n--- existing README ---\n${existingReadme.slice(0, 2000)}\n`
    : '';

  // For ML/data projects, add reproducibility sections — but only generic,
  // placeholder content. The author's actual machine/data are NOT in the repo,
  // so the model must never invent specifics (no real GPU models, no data sources).
  const mlBlock = isML
    ? `
This is a machine-learning / data project. ALSO include these sections:
- **Environment**: do NOT repeat the venv/pip commands already in Installation Steps.
  Instead, briefly note the required Python version and key library versions (from the
  manifest if present, otherwise a placeholder), and mention conda as a one-line alternative.
- **Hardware**: suggest a GENERIC minimum requirement, framed as a recommendation —
  for example "Minimum: a GPU with ~4GB VRAM; runs on CPU for small datasets." Keep the
  numbers modest/entry-level, NOT high-end. DO NOT state the author's actual machine and
  DO NOT name a specific GPU model or vendor (no RTX/GeForce/Nvidia/etc.).
- **Dataset**: describe the data the code consumes, grounded ONLY in the references below.
  DO NOT invent dataset names, sizes, sources, or download links. For anything not evident,
  use a placeholder, e.g. "> _Dataset source: <add link>_".

Dataset references detected in code (use only these; do not add others):
${datasetRefs.length ? datasetRefs.join('\n') : '(none detected — use a placeholder for the dataset)'}
`
    : '';

  const manifestBlock = manifest
    ? `\nDependency manifest (use its ACTUAL scripts/commands for install & run — do not invent commands like \`npm start\` if no "start" script exists):\n${manifest.slice(0, 1200)}\n`
    : '';

  return `You are a senior developer writing a professional README.md for a GitHub repository.

Repository: ${repoName}
Detected stack(s): ${stacks.join(', ') || 'unknown'}
File tree (partial):
${tree}

Key source files:
${code}
${manifestBlock}${improve}
Write a complete, professional README.md in GitHub-flavoured markdown. Include:
- Project title and one-paragraph description of what it actually does (infer from the code, do not invent features)
- Tech stack — list ONLY languages and tools from the detected stack(s) above; do NOT add languages that aren't actually used (note: filenames or strings mentioning another language do not mean the project uses it)
- Installation steps
- Usage example${runCommand ? ` — the run command is EXACTLY \`${runCommand}\`; use it verbatim and do NOT substitute \`npm start\`` : ''}
- Folder structure overview
${mlBlock}
Output ONLY the raw markdown. No preamble, no explanation, no code fences around the whole thing.`;
}

// ---------------------------------------------------------------------------
// 5. Dependency cleanup — LLM prompt
// ---------------------------------------------------------------------------
// Parse a requirements.txt-style manifest into { name(lowercase): pinnedVersion|null }.
function parseRequirements(text) {
  const map = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;
    const m = line.match(/^([A-Za-z0-9._-]+)\s*(==)?\s*([\w.*+]+)?/);
    if (m) map[m[1].toLowerCase()] = m[2] === '==' ? m[3] : null;
  }
  return map;
}

/**
 * Deterministic dependency report — pure set arithmetic + real PyPI pins, no LLM.
 * (Missing/Unused are exact comparisons; an LLM gives inconsistent answers here.)
 */
export function buildDepsReport({ packages, manifest, manifestPath = 'the manifest', latestVersions = {} }) {
  const pin = (p) => {
    const v = latestVersions[p] || latestVersions[p.toLowerCase()];
    return v ? `- ${p} → suggested \`${p}==${v}\`` : `- ${p}`;
  };
  const plain = (arr) => (arr.length ? arr.map((p) => `- ${p}`).join('\n') : '- None');
  const pinned = (arr) => (arr.length ? arr.map(pin).join('\n') : '- None');

  if (!manifest) {
    return `# Dependency report

> No dependency manifest found. A generated \`requirements.txt\` (listed alongside) covers the packages below.

## Used in code (no manifest present)
${pinned(packages)}
`;
  }

  const m = parseRequirements(manifest);
  const usedSet = new Set(packages.map((p) => p.toLowerCase()));
  const missing = packages.filter((p) => !(p.toLowerCase() in m));
  const unused = Object.keys(m).filter((n) => !usedSet.has(n));
  const unpinned = Object.entries(m).filter(([, v]) => !v).map(([n]) => n);

  return `# Dependency report

## Missing (imported in code, not in ${manifestPath})
${pinned(missing)}

## Unused (in ${manifestPath}, never imported)
${plain(unused)}

## Unpinned (no fixed version)
${pinned(unpinned)}
`;
}

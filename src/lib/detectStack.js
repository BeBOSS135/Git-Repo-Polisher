// Stack detection from a repo's file list.
// Returns ALL stacks present (a Python backend + JS frontend is common),
// with a primary chosen by file count so downstream templates can prioritise.

const SIGNALS = {
  python: { ext: ['py'], files: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'] },
  node:   { ext: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'], files: ['package.json'] },
  java:   { ext: ['java'], files: ['pom.xml', 'build.gradle'] },
  go:     { ext: ['go'], files: ['go.mod'] },
  rust:   { ext: ['rs'], files: ['Cargo.toml'] },
};

// Files/dirs that shouldn't count toward language detection.
const IGNORE = /(^|\/)(node_modules|venv|\.venv|dist|build|__pycache__|\.git)\//;

function extOf(path) {
  const base = path.split('/').pop();
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

function basename(path) {
  return path.split('/').pop();
}

/**
 * @param {string[]} fileList  repo-relative paths
 * @returns {{ stacks: string[], primary: string|null, counts: Record<string, number> }}
 */
export function detectStack(fileList) {
  const counts = {};
  const markerHit = {};

  for (const path of fileList) {
    if (IGNORE.test(path)) continue;
    const ext = extOf(path);
    const name = basename(path);

    for (const [stack, sig] of Object.entries(SIGNALS)) {
      if (sig.ext.includes(ext)) counts[stack] = (counts[stack] || 0) + 1;
      if (sig.files.includes(name)) markerHit[stack] = true;
    }
  }

  // A manifest file (package.json, go.mod...) confirms a stack even with few source files.
  for (const stack of Object.keys(markerHit)) {
    if (!counts[stack]) counts[stack] = 0;
  }

  const stacks = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const primary = stacks[0] || null;

  return { stacks, primary, counts };
}

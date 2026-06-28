// Deterministic requirements.txt extraction — no LLM (name mapping needs
// precision, not generation). Mirrors how pipreqs works:
// parse imports -> root module -> drop stdlib -> drop local modules -> map names.

// Common Python standard-library top-level modules (not exhaustive, but covers
// what shows up in typical project imports).
const STDLIB = new Set([
  'abc', 'argparse', 'ast', 'asyncio', 'base64', 'collections', 'contextlib',
  'copy', 'csv', 'datetime', 'decimal', 'enum', 'functools', 'glob', 'gzip',
  'hashlib', 'heapq', 'html', 'http', 'importlib', 'inspect', 'io', 'itertools',
  'json', 'logging', 'math', 'multiprocessing', 'operator', 'os', 'pathlib',
  'pickle', 'platform', 'queue', 'random', 're', 'shutil', 'signal', 'socket',
  'sqlite3', 'string', 'struct', 'subprocess', 'sys', 'tempfile', 'threading',
  'time', 'traceback', 'typing', 'unittest', 'urllib', 'uuid', 'warnings',
  'weakref', 'xml', 'zipfile', '__future__',
]);

// import root -> PyPI distribution name, only where they differ.
const ALIASES = {
  sklearn: 'scikit-learn',
  cv2: 'opencv-python',
  PIL: 'Pillow',
  yaml: 'PyYAML',
  bs4: 'beautifulsoup4',
  skimage: 'scikit-image',
  dotenv: 'python-dotenv',
  Crypto: 'pycryptodome',
  serial: 'pyserial',
  OpenSSL: 'pyOpenSSL',
};

function rootOf(modulePath) {
  return modulePath.split('.')[0]; // tensorflow.keras -> tensorflow
}

/**
 * @param {string[]} importLines  raw import/from lines (as scanImports collects)
 * @param {string[]} [localModules]  top-level module names defined in the repo
 * @returns {string[]} sorted PyPI package names
 */
export function extractPythonPackages(importLines, localModules = []) {
  const local = new Set(localModules);
  const roots = new Set();

  for (const line of importLines) {
    let m;
    if ((m = line.match(/^\s*from\s+([.\w]+)\s+import/))) {
      const root = rootOf(m[1]);
      if (root) roots.add(root); // skip relative imports (root === '')
    } else if ((m = line.match(/^\s*import\s+(.+)$/))) {
      for (const part of m[1].split(',')) {
        const mod = part.trim().split(/\s+as\s+/)[0].trim();
        const root = rootOf(mod);
        if (root) roots.add(root);
      }
    }
  }

  const pkgs = new Set();
  for (const r of roots) {
    if (STDLIB.has(r)) continue;
    if (local.has(r)) continue; // the project's own modules aren't dependencies
    pkgs.add(ALIASES[r] || r);
  }
  return [...pkgs].sort((a, b) => a.localeCompare(b));
}

/** Top-level module names a repo defines (so we don't list them as deps). */
export function localModulesFromTree(fileList) {
  const mods = new Set();
  for (const path of fileList) {
    const top = path.split('/')[0];
    if (path.includes('/')) {
      mods.add(top); // a package directory
    } else if (top.endsWith('.py')) {
      mods.add(top.slice(0, -3)); // a top-level module file
    }
  }
  return [...mods];
}

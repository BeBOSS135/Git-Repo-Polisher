// Deterministic "make this repo more professional" checklist.
// Every item is grounded in the actual repo layout and only fires when it applies —
// no generic filler. Suggestions only; nothing is moved or changed automatically.
// Does NOT repeat things the tool already generates (README/LICENSE/CI/.gitignore/requirements).

const SRC_EXT = {
  python: ['py'],
  node: ['js', 'jsx', 'ts', 'tsx', 'mjs'],
  java: ['java'],
  go: ['go'],
  rust: ['rs'],
};
// Unambiguous data formats only — excludes .json/.txt so config/manifest files
// (package.json, requirements.txt) aren't mistaken for datasets.
const DATA_EXT = /\.(csv|tsv|npz|npy|h5|hdf5|parquet|pkl|xlsx)$/i;
const IMG_EXT = /\.(png|jpe?g|gif|svg)$/i;

const extOf = (p) => {
  const b = p.split('/').pop();
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1).toLowerCase() : '';
};

export function buildSuggestions(analysis) {
  const { fileList, primary, fileSizes = {} } = analysis;
  const items = [];

  const topLevel = fileList.filter((p) => !p.includes('/'));
  const dirs = new Set(fileList.filter((p) => p.includes('/')).map((p) => p.split('/')[0]));
  const has = (d) => dirs.has(d);
  const srcExts = SRC_EXT[primary] || [];

  // 1. Flat structure → group source under a package folder.
  const rootSrc = topLevel.filter((p) => srcExts.includes(extOf(p)));
  if (rootSrc.length >= 3 && !has('src') && !has(analysis.repoName)) {
    items.push(
      `Group your ${rootSrc.length} source files into a \`src/\` (or package) folder instead of the repo root — cleaner imports and a clearer layout.`
    );
  }

  // 2. Data files at root → data/ folder.
  const dataRoot = topLevel.filter((p) => DATA_EXT.test(p));
  if (dataRoot.length && !has('data')) {
    const sample = dataRoot.slice(0, 3).join(', ') + (dataRoot.length > 3 ? ', …' : '');
    items.push(
      `Move data files (${sample}) into a \`data/\` folder; add it to \`.gitignore\` if they are large.`
    );
  }

  // 3. Notebooks at root → notebooks/.
  const nb = topLevel.filter((p) => /\.ipynb$/i.test(p));
  if (nb.length && !has('notebooks')) {
    items.push(`Keep Jupyter notebooks in a \`notebooks/\` folder.`);
  }

  // 4. Loose images/plots at root → figures/.
  const imgs = topLevel.filter((p) => IMG_EXT.test(p));
  if (imgs.length >= 2 && !has('figures') && !has('assets') && !has('images')) {
    items.push(`Move plots/images into a \`figures/\` (or \`assets/\`) folder and gitignore the generated ones.`);
  }

  // 5. No tests → add a tests/ dir.
  const hasTests = has('tests') || has('test') || fileList.some((p) => /(^|\/)test/i.test(p));
  if (!hasTests) {
    const fw = primary === 'node' ? 'vitest/jest' : 'pytest';
    items.push(`Add a \`tests/\` directory with a few unit tests (${fw}) — even a couple signals the project is maintained.`);
  }

  // 6. One oversized source file → split into modules.
  const bigSrc = Object.entries(fileSizes)
    .filter(([p]) => srcExts.includes(extOf(p)))
    .sort((a, b) => b[1] - a[1])[0];
  if (bigSrc && bigSrc[1] > 25_000) {
    items.push(
      `\`${bigSrc[0]}\` is large (~${Math.round(bigSrc[1] / 1024)} KB). Consider splitting it into focused modules (e.g. data loading, model, training).`
    );
  }

  // 7. No contributor guide.
  if (!fileList.some((p) => /^CONTRIBUTING/i.test(p))) {
    items.push(`Add a \`CONTRIBUTING.md\` if you'd like others to contribute.`);
  }

  // 8. Python project not packaged.
  if (primary === 'python' && !fileList.some((p) => /(setup\.py|pyproject\.toml)$/i.test(p))) {
    items.push(`Add a \`pyproject.toml\` to make the project pip-installable and hold its metadata.`);
  }

  const footer =
    '\n_Suggestions only — apply the ones that fit. Nothing here is changed automatically._\n';

  if (!items.length) {
    return `# Suggestions\n\nThe repo layout already looks clean — no structural changes needed.\n${footer}`;
  }
  return (
    `# Suggestions to make this repo more professional\n\n` +
    items.map((i) => `- [ ] ${i}`).join('\n') +
    `\n${footer}`
  );
}

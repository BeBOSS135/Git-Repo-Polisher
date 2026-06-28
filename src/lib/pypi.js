// Look up real package versions from the public PyPI JSON API (no auth, CORS-open).
// Used to ground "suggested pin" advice so the model never guesses version numbers.

const PYPI = 'https://pypi.org/pypi';

/**
 * @param {string[]} packages  PyPI distribution names
 * @returns {Promise<Record<string,string>>}  name -> latest stable version (missing if lookup failed)
 */
export async function fetchLatestVersions(packages) {
  const entries = await Promise.all(
    packages.map(async (pkg) => {
      try {
        const res = await fetch(`${PYPI}/${encodeURIComponent(pkg)}/json`);
        if (!res.ok) return null;
        const data = await res.json();
        return [pkg, data.info?.version];
      } catch {
        return null; // network/offline — skip, caller treats as unknown
      }
    })
  );
  return Object.fromEntries(entries.filter((e) => e && e[1]));
}

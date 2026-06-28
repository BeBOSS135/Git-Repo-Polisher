import React, { useState, useEffect } from 'react';
import { GitHub, parseRepoUrl } from './lib/github.js';
import { isUp } from './lib/ollama.js';
import { analyseRepo, generateFiles, pushFiles } from './lib/pipeline.js';

const STEP = { INPUT: 'input', PREVIEW: 'preview', DONE: 'done' };

export default function App() {
  const [token, setToken] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [step, setStep] = useState(STEP.INPUT);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [ollamaOk, setOllamaOk] = useState(null);

  const [target, setTarget] = useState(null); // { gh, owner, repo }
  const [files, setFiles] = useState([]); // generated files (editable)
  const [include, setInclude] = useState({}); // id -> bool
  const [pushResults, setPushResults] = useState(null); // { commit, paths }

  useEffect(() => { isUp().then(setOllamaOk); }, []);

  async function handleScan(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { owner, repo } = parseRepoUrl(repoUrl);
      const gh = new GitHub(token.trim());
      const analysis = await analyseRepo(gh, owner, repo, setStatus);
      const generated = await generateFiles(analysis, { onProgress: setStatus });
      setTarget({ gh, owner, repo, branch: analysis.branch });
      setFiles(generated);
      // Advisory files (dependency report) unchecked by default.
      setInclude(Object.fromEntries(generated.map((f) => [f.id, !f.advisory])));
      setStep(STEP.PREVIEW);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  function editFile(id, content) {
    setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, content } : f)));
  }

  async function handlePush() {
    setError('');
    setBusy(true);
    try {
      const selected = files.filter((f) => include[f.id]);
      const result = await pushFiles(
        target.gh, target.owner, target.repo, target.branch, selected
      );
      setPushResults(result);
      setStep(STEP.DONE);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep(STEP.INPUT);
    setFiles([]);
    setPushResults(null);
    setError('');
  }

  return (
    <div className="wrap">
      <header>
        <h1>GitHub Repo Polisher</h1>
        <p className="sub">
          Local AI (Ollama) generates the files that make a repo look professional.
          {' '}
          <span className={`pill ${ollamaOk ? 'ok' : ollamaOk === false ? 'bad' : ''}`}>
            {ollamaOk == null ? 'checking Ollama…' : ollamaOk ? 'Ollama ready' : 'Ollama offline'}
          </span>
        </p>
      </header>

      {error && <div className="error">{error}</div>}

      {step === STEP.INPUT && (
        <form onSubmit={handleScan} className="card">
          <label>
            GitHub token <span className="hint">(fine-grained: Contents R/W + Metadata R, plus Workflows R/W to push the CI file; never stored)</span>
            <input
              type="password" value={token} autoComplete="off"
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_…" required
            />
          </label>
          <label>
            Repository <span className="hint">(owner/repo or full URL)</span>
            <input
              type="text" value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="BeBOSS135/ML-classification" required
            />
          </label>
          <button type="submit" disabled={busy || !ollamaOk}>
            {busy ? status || 'Working…' : 'Scan & Generate'}
          </button>
          {!ollamaOk && ollamaOk !== null && (
            <p className="hint">Start Ollama first: <code>ollama serve</code></p>
          )}
        </form>
      )}

      {step === STEP.PREVIEW && (
        <>
          <div className="toolbar">
            <span>{target.owner}/{target.repo} — review & edit, then push selected files.</span>
            <div>
              <button className="ghost" onClick={reset} disabled={busy}>Cancel</button>
              <button onClick={handlePush} disabled={busy}>
                {busy ? 'Pushing…' : `Push ${files.filter((f) => include[f.id]).length} file(s)`}
              </button>
            </div>
          </div>
          {files.map((f) => (
            <div className="card file" key={f.id}>
              <div className="file-head">
                <label className="check">
                  <input
                    type="checkbox" checked={!!include[f.id]}
                    onChange={(e) => setInclude((s) => ({ ...s, [f.id]: e.target.checked }))}
                  />
                  <strong>{f.label}</strong>
                  <code>{f.path}</code>
                </label>
                <span className="badges">
                  {f.advisory && <span className="badge advisory">advisory</span>}
                  <span className={`badge ${f.llm ? 'llm' : 'tmpl'}`}>{f.llm ? 'AI' : 'template'}</span>
                  <span className="badge">{f.sha ? 'update' : 'create'}</span>
                </span>
              </div>
              <textarea
                value={f.content}
                onChange={(e) => editFile(f.id, e.target.value)}
                spellCheck={false}
                rows={Math.min(20, f.content.split('\n').length + 1)}
              />
            </div>
          ))}
        </>
      )}

      {step === STEP.DONE && pushResults && (
        <div className="card">
          <h2>Pushed ✓</h2>
          <p>
            {pushResults.paths.length} file(s) in one commit{' '}
            <code>{pushResults.commit?.slice(0, 7)}</code>
          </p>
          <ul>
            {pushResults.paths.map((p) => (
              <li key={p}><code>{p}</code></li>
            ))}
          </ul>
          {pushResults.skipped?.length > 0 && (
            <div className="error" style={{ marginTop: 0 }}>
              Skipped: {pushResults.skipped.map((p) => <code key={p}>{p}</code>)}
              <br />{pushResults.skipReason}
            </div>
          )}
          <a
            href={`https://github.com/${target.owner}/${target.repo}/commit/${pushResults.commit}`}
            target="_blank" rel="noreferrer"
          >View commit on GitHub →</a>
          <div><button className="ghost" onClick={reset}>Polish another</button></div>
        </div>
      )}

      <footer>Runs locally · $0 · token never leaves your machine</footer>
    </div>
  );
}

/**
 * Frees the default Next.js port before dev/start so `EADDRINUSE` does not block local runs.
 * Port: PORT env, else 3000 (must match package.json -p flags).
 */
const { execSync } = require('child_process');

const port = String(process.env.PORT || process.env.NEXT_PORT || '3000').trim();

function log(msg) {
  console.log(`[gloss-boss-atx] ${msg}`);
}

function killWin32() {
  let out = '';
  try {
    out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', windowsHide: true });
  } catch {
    return;
  }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes(`:${port}`) || !/LISTENING/i.test(line)) continue;
    const m = line.trim().match(/(\d+)\s*$/);
    if (m && m[1] !== '0') pids.add(m[1]);
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore', windowsHide: true });
      log(`Freed port ${port} (stopped PID ${pid}).`);
    } catch {
      log(`Could not stop PID ${pid} on port ${port} (may need elevated shell or process already exited).`);
    }
  }
}

function killUnix() {
  try {
    const pids = execSync(`lsof -t -iTCP:${port} -sTCP:LISTEN`, { encoding: 'utf8' }).trim();
    if (!pids) return;
    for (const pid of pids.split(/\n/).filter(Boolean)) {
      try {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
        log(`Freed port ${port} (stopped PID ${pid}).`);
      } catch {
        log(`Could not stop PID ${pid} on port ${port}.`);
      }
    }
  } catch {
    /* nothing listening or lsof missing */
  }
}

if (process.platform === 'win32') killWin32();
else killUnix();

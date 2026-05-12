const fs = require('fs');
const path = require('path');
const https = require('https');

// Simple CF API wrapper
function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function asKey(s) {
  // unique key for an accepted submission
  return `${s.problem.contestId}-${s.problem.index}`;
}

async function main() {
  const CF_HANDLE = process.env.CF_HANDLE;
  if (!CF_HANDLE) throw new Error('Missing CF_HANDLE env var');

  const acceptedPath = path.join(__dirname, '..', 'data', 'accepted.json');
  const summaryPath = path.join(__dirname, '..', 'data', 'summary.json');

  const accepted = JSON.parse(fs.readFileSync(acceptedPath, 'utf8'));
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

  let added = 0;

  // Pagination so we don't miss older accepted solves.
  // CF API supports: from, count.
  const pageSize = 2000;
  let from = 1;

  while (true) {
    const url = `https://codeforces.com/api/user.status?handle=${encodeURIComponent(CF_HANDLE)}&from=${from}&count=${pageSize}`;
    const resp = await getJson(url);
    if (!resp || resp.status !== 'OK') throw new Error('Codeforces API error');

    const submissions = resp.result || [];
    if (submissions.length === 0) break;

    for (const s of submissions) {
      if (s.verdict !== 'OK') continue;
      const key = asKey(s);
      if (!accepted.accepted_problem_keys.includes(key)) {
        accepted.accepted_problem_keys.push(key);
        added++;
      }
    }

    if (submissions.length < pageSize) break; // reached the end
    from += pageSize;
  }

  accepted.handle = CF_HANDLE;
  accepted.last_checked = new Date().toISOString();

  summary.handle = CF_HANDLE;
  summary.accepted_count_total = accepted.accepted_problem_keys.length;
  summary.last_activity = `Added ${added} new accepted problems at ${new Date().toISOString()}`;
  summary.last_updated = new Date().toISOString();

  fs.writeFileSync(acceptedPath, JSON.stringify(accepted, null, 2));
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

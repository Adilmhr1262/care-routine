/* CareRoutine offline verification: service worker controls the page, the
   browser goes offline, the page reloads from cache, data entry works
   offline, and a second offline reload keeps the data.
   Usage: node tests/careroutine-offline.js */
const { firefox } = require('/home/hatch/workspace/goals/ship-one-project-per-day/hidden_files/test-tools/node_modules/playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PROJECT = '/home/hatch/workspace/daily-projects/2026-11-21-careroutine';
const PORT = 8146;
const BASE = 'http://127.0.0.1:' + PORT + '/index.html';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, extra) {
  if (ok) { pass++; console.log('PASS: ' + name); }
  else { fail++; failures.push(name); console.log('FAIL: ' + name + (extra ? ' :: ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const file = path.join(PROJECT, urlPath);
      if (!file.startsWith(PROJECT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function dbState(page) {
  return await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('careroutine', 1);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['routines', 'completions'], 'readonly');
      const out = {};
      let done = 0;
      for (const name of ['routines', 'completions']) {
        const r = tx.objectStore(name).getAll();
        r.onsuccess = () => { out[name] = r.result; if (++done === 2) { db.close(); resolve(out); } };
        r.onerror = () => reject(r.error);
      }
    };
    req.onerror = () => reject(req.error);
  }));
}

async function bodyText(page) { return await page.evaluate(() => document.body.innerText); }

(async () => {
  const server = await serve();
  const browser = await firefox.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('requestfailed', r => failedRequests.push(r.url()));

  // 1. Online first visit: service worker registers and caches the shell
  await page.goto(BASE, { waitUntil: 'load' });
  await sleep(1500);
  const swControlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  check('service worker controls the page', swControlled);
  const swKeys = await page.evaluate(() => caches.keys());
  check('cache careroutine-v1 present', swKeys.includes('careroutine-v1'), JSON.stringify(swKeys));
  const cached = await page.evaluate(() => caches.open('careroutine-v1').then(c => c.keys()).then(ks => ks.map(k => k.url)));
  check('app shell cached', cached.some(u => u.endsWith('/index.html')) && cached.some(u => u.endsWith('/app.js')) && cached.some(u => u.endsWith('/styles.css')), JSON.stringify(cached));

  // 2. Go offline and reload: the page must load from cache
  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await sleep(1200);
  check('page loads offline', (await bodyText(page)).includes('CareRoutine'));
  check('dashboard renders offline', (await bodyText(page)).includes('Total Routines'));
  check('empty state renders offline', (await bodyText(page)).includes('Nothing scheduled yet'));

  // 3. Create a routine offline
  const today = await page.evaluate(() => {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  });
  await page.click('.sidebar [data-view="routines"]');
  await sleep(300);
  await page.click('#addRoutineBtn');
  await page.fill('#routineName', 'Wash water bottle');
  await page.selectOption('#routineCategory', 'Hygiene');
  await page.fill('#routineInterval', '2');
  await page.selectOption('#routineUnit', 'days');
  await page.click('#routineForm button[type="submit"]');
  await sleep(600);
  let db = await dbState(page);
  check('routine created offline', db.routines.length === 1 && db.routines[0].name === 'Wash water bottle');

  // 4. Mark it done offline
  const rid = db.routines[0].id;
  await page.click('#view-routines [data-mark-done="' + rid + '"]');
  await sleep(300);
  await page.fill('#doneDate', today);
  await page.click('#doneForm button[type="submit"]');
  await sleep(600);
  db = await dbState(page);
  check('completion recorded offline', db.completions.length === 1 && db.completions[0].date === today);

  // 5. Second offline reload: data survives
  await page.reload({ waitUntil: 'load' });
  await sleep(1200);
  check('page still loads offline after data entry', (await bodyText(page)).includes('CareRoutine'));
  db = await dbState(page);
  check('routine survives offline reload', db.routines.length === 1);
  check('completion survives offline reload', db.completions.length === 1);
  await page.click('.sidebar [data-view="dashboard"]');
  await sleep(400);
  check('dashboard shows 1 routine offline', (await bodyText(page)).includes('Wash water bottle') || (await page.evaluate(() => document.querySelector('#statTotal').textContent)) === '1');

  // 6. Cleanliness while offline
  check('zero console errors offline', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('zero page errors offline', pageErrors.length === 0, pageErrors.join(' | '));
  check('zero failed requests offline', failedRequests.length === 0, failedRequests.join(', '));

  await context.setOffline(false);
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed.' + (failures.length ? ' Failed: ' + failures.join('; ') : ''));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE ERROR', e); process.exit(2); });

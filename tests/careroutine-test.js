/* CareRoutine verification suite (headless Firefox via playwright-core).
   Serves the project over local HTTP, then runs the order's acceptance
   checklist plus validation and edge cases. Usage: node tests/careroutine-test.js */
const { firefox } = require('/home/hatch/workspace/goals/ship-one-project-per-day/hidden_files/test-tools/node_modules/playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PROJECT = '/home/hatch/workspace/daily-projects/2026-11-21-careroutine';
const PORT = 8145;
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

async function statValue(page, label) {
  return await page.evaluate((lbl) => {
    const cards = Array.from(document.querySelectorAll('.stat-card'));
    const card = cards.find(c => c.querySelector('.stat-label') && c.querySelector('.stat-label').textContent.trim() === lbl);
    return card ? card.querySelector('.stat-value').textContent.trim() : null;
  }, label);
}

async function bodyText(page) { return await page.evaluate(() => document.body.innerText); }

/* page-local date YYYY-MM-DD for today + offset days */
async function pageDate(page, offsetDays) {
  return await page.evaluate((off) => {
    const d = new Date(Date.now() + off * 86400000);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }, offsetDays);
}

async function addRoutine(page, name, category, interval, unit, startDate, lastDone, notes) {
  await page.click('.sidebar [data-view="routines"]');
  await sleep(300);
  await page.click('#addRoutineBtn');
  await page.fill('#routineName', name);
  await page.selectOption('#routineCategory', category);
  await page.fill('#routineInterval', String(interval));
  await page.selectOption('#routineUnit', unit);
  if (startDate) await page.fill('#routineStartDate', startDate);
  if (lastDone) await page.fill('#routineLastDone', lastDone);
  if (notes) await page.fill('#routineNotes', notes);
  await page.click('#routineForm button[type="submit"]');
  await sleep(500);
}

(async () => {
  const server = await serve();
  const browser = await firefox.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const external = [];
  const consoleErrors = [];
  const pageErrors = [];
  let dialogSeen = false;
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:' + PORT)) external.push(r.url()); });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('dialog', () => { dialogSeen = true; });

  await page.goto(BASE, { waitUntil: 'load' });
  await sleep(900);

  const TODAY = await pageDate(page, 0);
  const YESTERDAY = await pageDate(page, -1);
  const LAST_WEEK = await pageDate(page, -7);
  const NEXT_WEEK = await pageDate(page, 7);

  // 1. First launch: zero records, meaningful empty states
  let db = await dbState(page);
  check('first launch zero routines', db.routines.length === 0);
  check('first launch zero completions', db.completions.length === 0);
  check('dashboard total 0', (await statValue(page, 'Total Routines')) === '0');
  check('dashboard due today 0', (await statValue(page, 'Due Today')) === '0');
  check('dashboard overdue 0', (await statValue(page, 'Overdue')) === '0');
  check('dashboard completed month 0', (await statValue(page, 'Completed This Month')) === '0');
  check('empty state text present', (await bodyText(page)).includes('Nothing scheduled yet'));

  // 2. Add Bedsheets: weekly, last done 7 days ago -> due today
  await addRoutine(page, 'Change bedsheets', 'Cleaning', 1, 'weeks', '', LAST_WEEK, '');
  db = await dbState(page);
  check('routine 1 saved', db.routines.length === 1 && db.routines[0].name === 'Change bedsheets');
  check('last-done stored as completion', db.completions.length === 1 && db.completions[0].date === LAST_WEEK);
  check('routine card shows name', (await bodyText(page)).includes('Change bedsheets'));
  check('routine card shows Due Today', (await bodyText(page)).includes('Due Today'));
  await page.click('.sidebar [data-view="dashboard"]');
  await sleep(400);
  check('dashboard due today 1', (await statValue(page, 'Due Today')) === '1');
  check('dashboard total 1', (await statValue(page, 'Total Routines')) === '1');
  check('attention lists bedsheets', (await bodyText(page)).includes('Change bedsheets'));

  // 3. Validation rejections
  await page.click('.sidebar [data-view="routines"]');
  await page.click('#addRoutineBtn');
  await page.fill('#routineName', 'x');
  await page.click('#routineForm button[type="submit"]');
  await sleep(300);
  check('1-char routine name rejected', await page.isVisible('#routineError'));
  db = await dbState(page);
  check('no routine added after rejection', db.routines.length === 1);
  await page.click('#routineDialog [data-close]');
  await sleep(200);
  await page.click('#addRoutineBtn');
  await page.fill('#routineName', 'Valid name');
  await page.fill('#routineInterval', '0');
  await page.click('#routineForm button[type="submit"]');
  await sleep(300);
  check('interval 0 rejected', await page.isVisible('#routineError'));
  await page.click('#routineDialog [data-close]');

  // XSS: markup in routine name renders as text
  await addRoutine(page, '<img src=x onerror=alert(1)>', 'Home', 1, 'days', '', '', '');
  db = await dbState(page);
  check('markup routine saved as text', db.routines.length === 2);
  check('no injected img element', (await page.evaluate(() => document.querySelectorAll('#routineList img').length)) === 0);
  check('no alert dialog fired', dialogSeen === false);
  // remove the markup routine to keep later counts clean
  const markupId = db.routines.find(r => r.name.includes('img')).id;
  await page.click('.sidebar [data-view="routines"]');
  await sleep(300);
  const markupCard = await page.evaluate((id) => {
    const cards = Array.from(document.querySelectorAll('#view-routines .routine-card'));
    return cards.length;
  }, markupId);
  check('routine list has 2 cards', markupCard === 2);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.routine-card .btn-danger'));
    btns[btns.length - 1].click();
  });
  await sleep(300);
  await page.click('#confirmYes');
  await sleep(500);
  db = await dbState(page);
  check('markup routine deleted', db.routines.length === 1);

  // 4. Add AC filter: monthly, last done 2026-10-31 -> next due 2026-11-30, upcoming
  await addRoutine(page, 'Clean AC filter', 'Appliances', 1, 'months', '', '2026-10-31', 'Use the soft brush.');
  db = await dbState(page);
  check('routine 2 saved', db.routines.length === 2);
  check('AC filter next due Nov 30', (await bodyText(page)).includes('Nov 30, 2026'));
  check('AC filter shows Upcoming', (await bodyText(page)).includes('Upcoming'));

  // 5. Add Toothbrush: every 3 months, last done 2026-07-01 -> next due 2026-10-01, overdue
  await addRoutine(page, 'Replace toothbrush', 'Hygiene', 3, 'months', '', '2026-07-01', '');
  db = await dbState(page);
  check('routine 3 saved', db.routines.length === 3);
  check('toothbrush shows Overdue', (await bodyText(page)).includes('Overdue'));
  await page.click('.sidebar [data-view="dashboard"]');
  await sleep(400);
  check('dashboard overdue 1', (await statValue(page, 'Overdue')) === '1');
  check('dashboard due today 1', (await statValue(page, 'Due Today')) === '1');

  // 6. Mark Done on bedsheets (due today): rapid double click must not duplicate
  await page.click('.sidebar [data-view="routines"]');
  await sleep(300);
  const bedsheetsId = (await dbState(page)).routines.find(r => r.name === 'Change bedsheets').id;
  await page.click('#view-routines [data-mark-done="' + bedsheetsId + '"]');
  await sleep(300);
  await page.fill('#doneDate', TODAY);
  // submit twice quickly via two clicks
  await page.click('#doneForm button[type="submit"]');
  await page.click('#doneForm button[type="submit"]').catch(() => {});
  await sleep(600);
  db = await dbState(page);
  const bedCompletions = db.completions.filter(c => c.routineId === bedsheetsId);
  check('mark done recorded once despite double click', bedCompletions.length === 2, 'count ' + bedCompletions.length); // 1 initial + 1 today
  check('no duplicate completion for today', bedCompletions.filter(c => c.date === TODAY).length === 1);
  check('bedsheets now upcoming', (await bodyText(page)).includes('Upcoming'));
  await page.click('.sidebar [data-view="dashboard"]');
  await sleep(400);
  check('dashboard due today 0 after done', (await statValue(page, 'Due Today')) === '0');
  check('dashboard completed this month 2', (await statValue(page, 'Completed This Month')) === '2');

  // 7. Pause toothbrush -> overdue drops to 0; resume -> back to 1
  await page.click('.sidebar [data-view="routines"]');
  await sleep(300);
  const toothId = (await dbState(page)).routines.find(r => r.name === 'Replace toothbrush').id;
  await page.evaluate((id) => {
    const cards = Array.from(document.querySelectorAll('.routine-card'));
    const card = cards.find(c => c.textContent.includes('Replace toothbrush'));
    Array.from(card.querySelectorAll('.btn')).find(b => b.textContent.trim() === 'Pause').click();
  }, toothId);
  await sleep(500);
  check('paused badge shown', (await bodyText(page)).includes('Paused'));
  await page.click('.sidebar [data-view="dashboard"]');
  await sleep(400);
  check('paused routine excluded from overdue', (await statValue(page, 'Overdue')) === '0');
  await page.click('.sidebar [data-view="routines"]');
  await sleep(300);
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.routine-card'));
    const card = cards.find(c => c.textContent.includes('Replace toothbrush'));
    Array.from(card.querySelectorAll('.btn')).find(b => b.textContent.trim() === 'Resume').click();
  });
  await sleep(500);
  await page.click('.sidebar [data-view="dashboard"]');
  await sleep(400);
  check('resumed routine overdue again', (await statValue(page, 'Overdue')) === '1');

  // 8. Edit routine: change AC filter interval to 2 months
  await page.click('.sidebar [data-view="routines"]');
  await sleep(300);
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.routine-card'));
    const card = cards.find(c => c.textContent.includes('Clean AC filter'));
    Array.from(card.querySelectorAll('.btn')).find(b => b.textContent.trim() === 'Edit').click();
  });
  await sleep(300);
  await page.fill('#routineInterval', '2');
  await page.click('#routineForm button[type="submit"]');
  await sleep(500);
  db = await dbState(page);
  check('routine edit saved interval 2', db.routines.find(r => r.name === 'Clean AC filter').intervalValue === 2);
  check('AC filter next due Dec 31 after edit', (await bodyText(page)).includes('Dec 31, 2026'));

  // 9. Search / filters / sort
  await page.fill('#routineSearch', 'tooth');
  await sleep(300);
  let listText = await bodyText(page);
  check('search finds toothbrush only', listText.includes('Replace toothbrush') && !listText.includes('Clean AC filter'));
  await page.fill('#routineSearch', '');
  await page.selectOption('#filterStatus', 'Overdue');
  await sleep(300);
  listText = await bodyText(page);
  check('status filter Overdue', listText.includes('Replace toothbrush') && !listText.includes('Clean AC filter'));
  await page.selectOption('#filterStatus', '');
  await page.selectOption('#filterCategory', 'Appliances');
  await sleep(300);
  listText = await bodyText(page);
  check('category filter Appliances', listText.includes('Clean AC filter') && !listText.includes('Replace toothbrush'));
  await page.selectOption('#filterCategory', '');
  await page.selectOption('#sortRoutines', 'name');
  await sleep(300);
  const order = await page.evaluate(() => Array.from(document.querySelectorAll('#view-routines .routine-card .routine-name')).map(n => n.textContent));
  check('sort by name A-Z', JSON.stringify(order) === JSON.stringify(['Change bedsheets', 'Clean AC filter', 'Replace toothbrush']), JSON.stringify(order));
  await page.selectOption('#sortRoutines', 'due');

  // 10. History: edit a completion date -> next due recalculates
  await page.click('.sidebar [data-view="history"]');
  await sleep(400);
  let histText = await bodyText(page);
  check('history shows 4 completions', (await page.evaluate(() => document.querySelectorAll('#historyList .history-card').length)) === 4);
  check('history summary 4', (await bodyText(page)).includes('4 completions'));
  // month filter: October 2026 -> only the 2026-10-31 AC completion
  await page.fill('#filterMonth', '2026-10');
  await sleep(300);
  check('month filter October shows 1', (await page.evaluate(() => document.querySelectorAll('#historyList .history-card').length)) === 1);
  await page.click('#clearHistoryFilters');
  await sleep(300);
  // edit the bedsheets completion dated TODAY to YESTERDAY: next due moves from Nov 28 to Nov 27
  const todayCompletion = (await dbState(page)).completions.find(c => c.routineId === bedsheetsId && c.date === TODAY);
  await page.evaluate((id) => {
    const cards = Array.from(document.querySelectorAll('#historyList .history-card'));
    const card = cards.find(c => c.textContent.includes('Change bedsheets') && c.textContent.includes(new Date().getFullYear()));
    Array.from(card.querySelectorAll('.btn')).find(b => b.textContent.trim() === 'Edit').click();
  }, todayCompletion.id);
  await sleep(300);
  await page.fill('#editCompletionDate', YESTERDAY);
  await page.click('#editCompletionForm button[type="submit"]');
  await sleep(500);
  db = await dbState(page);
  check('completion edit saved', db.completions.find(c => c.id === todayCompletion.id).date === YESTERDAY);
  await page.click('.sidebar [data-view="routines"]');
  await sleep(400);
  check('next due recalculated to Nov 27', (await bodyText(page)).includes('Nov 27, 2026'));
  // delete that completion: bedsheets falls back to last-done 7 days ago -> due today again
  await page.click('.sidebar [data-view="history"]');
  await sleep(300);
  const editedCompletion = (await dbState(page)).completions.find(c => c.id === todayCompletion.id);
  await page.evaluate((id) => {
    const cards = Array.from(document.querySelectorAll('#historyList .history-card'));
    const card = cards.find(c => c.textContent.includes('Change bedsheets'));
    Array.from(card.querySelectorAll('.btn')).find(b => b.textContent.trim() === 'Delete').click();
  }, editedCompletion.id);
  await sleep(300);
  await page.click('#confirmYes');
  await sleep(500);
  db = await dbState(page);
  check('completion deleted', !db.completions.find(c => c.id === todayCompletion.id));
  await page.click('.sidebar [data-view="dashboard"]');
  await sleep(400);
  check('bedsheets due today again after delete', (await statValue(page, 'Due Today')) === '1');

  // 11. CSV export content
  const dlCsv = page.waitForEvent('download', { timeout: 10000 });
  await page.click('.sidebar [data-view="history"]');
  await sleep(300);
  await page.click('#exportCsvBtn');
  const csvFile = await dlCsv;
  const csvPath = '/tmp/careroutine-test.csv';
  await csvFile.saveAs(csvPath);
  const csvText = fs.readFileSync(csvPath, 'utf8');
  check('csv header present', csvText.startsWith('Routine,Category,Date,Note'));
  check('csv has bedsheets row', csvText.includes('Change bedsheets,Cleaning,' + LAST_WEEK));
  check('csv has toothbrush row', csvText.includes('Replace toothbrush,Hygiene,2026-07-01'));

  // 12. JSON backup export, invalid restore rejected, valid restore works
  await page.click('.sidebar [data-view="settings"]');
  await sleep(300);
  const dlJson = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#exportJsonBtn');
  const jsonFile = await dlJson;
  const jsonPath = '/tmp/careroutine-backup.json';
  await jsonFile.saveAs(jsonPath);
  const backup = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  check('backup schema 1', backup.schema === 1 && backup.app === 'careroutine');
  check('backup has 3 routines 3 completions', backup.routines.length === 3 && backup.completions.length === 3, JSON.stringify({ r: backup.routines.length, c: backup.completions.length }));
  const badPath = '/tmp/careroutine-bad.json';
  fs.writeFileSync(badPath, JSON.stringify({ schema: 99, app: 'careroutine', routines: [], completions: [] }));
  await page.setInputFiles('#importJsonInput', badPath);
  await sleep(500);
  check('invalid backup rejected with message', (await bodyText(page)).includes('Backup rejected'));
  db = await dbState(page);
  check('data unchanged after bad restore', db.routines.length === 3 && db.completions.length === 3);
  await page.setInputFiles('#importJsonInput', jsonPath);
  await sleep(500);
  check('restore asks to replace', (await bodyText(page)).includes('Replace all data?'));
  await page.click('#confirmYes');
  await sleep(600);
  check('valid backup restored', (await bodyText(page)).includes('Backup restored'));
  db = await dbState(page);
  check('data intact after valid restore', db.routines.length === 3 && db.completions.length === 3);

  // 13. Delete routine cascades its history
  await page.click('.sidebar [data-view="routines"]');
  await sleep(300);
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.routine-card'));
    const card = cards.find(c => c.textContent.includes('Replace toothbrush'));
    Array.from(card.querySelectorAll('.btn')).find(b => b.textContent.trim() === 'Delete').click();
  });
  await sleep(300);
  check('delete confirm mentions completion', (await bodyText(page)).includes('completion'));
  await page.click('#confirmYes');
  await sleep(500);
  db = await dbState(page);
  check('routine deleted', db.routines.length === 2);
  check('routine history cascaded', db.completions.filter(c => c.routineId === toothId).length === 0);
  await page.click('.sidebar [data-view="dashboard"]');
  await sleep(300);
  check('dashboard total 2 after delete', (await statValue(page, 'Total Routines')) === '2');
  check('dashboard overdue 0 after delete', (await statValue(page, 'Overdue')) === '0');

  // 14. Persistence after reload + dark mode persists
  await page.reload({ waitUntil: 'load' });
  await sleep(900);
  db = await dbState(page);
  check('persistence after reload', db.routines.length === 2 && db.completions.length === 2);
  await page.click('.sidebar [data-view="settings"]');
  await sleep(300);
  await page.check('input[name="theme"][value="dark"]');
  await sleep(300);
  check('dark theme applied', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark');
  await page.reload({ waitUntil: 'load' });
  await sleep(900);
  check('dark theme persists after reload', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark');
  await page.click('.sidebar [data-view="settings"]');
  await sleep(300);
  await page.check('input[name="theme"][value="light"]');
  await sleep(200);

  // 15. Service worker cache
  const swKeys = await page.evaluate(() => caches.keys());
  check('service worker cache exists', swKeys.includes('careroutine-v1'), JSON.stringify(swKeys));

  // 16. Responsive: no overflow, correct nav per width
  for (const w of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    await sleep(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('no horizontal overflow at ' + w + 'px', overflow <= 0, 'overflow ' + overflow);
  }
  await page.setViewportSize({ width: 375, height: 800 });
  await sleep(300);
  check('bottom nav visible at 375px', await page.isVisible('.bottom-nav'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await sleep(300);
  check('sidebar visible at 1440px', await page.isVisible('.sidebar'));

  // 17. Delete all requires DELETE, then empties
  await page.click('.sidebar [data-view="settings"]');
  await page.click('#deleteAllBtn');
  await sleep(300);
  check('delete-all button disabled until DELETE', await page.isDisabled('#deleteAllYes'));
  await page.fill('#deleteAllConfirm', 'DELETE');
  await sleep(200);
  check('delete-all button enabled after DELETE', await page.isEnabled('#deleteAllYes'));
  await page.click('#deleteAllYes');
  await sleep(600);
  db = await dbState(page);
  check('delete all empties routines', db.routines.length === 0);
  check('delete all empties completions', db.completions.length === 0);

  // 18. Cleanliness
  check('zero external requests', external.length === 0, external.join(', '));
  check('zero console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('zero page errors', pageErrors.length === 0, pageErrors.join(' | '));

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed.' + (failures.length ? ' Failed: ' + failures.join('; ') : ''));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE ERROR', e); process.exit(2); });

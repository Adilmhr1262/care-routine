/* CareRoutine live GitHub Pages check (headless Firefox).
   Usage: node tests/careroutine-live-check.js */
const { firefox } = require('/home/hatch/workspace/goals/ship-one-project-per-day/hidden_files/test-tools/node_modules/playwright-core');

const BASE = 'https://adilmhr1262.github.io/care-routine/index.html';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, extra) {
  if (ok) { pass++; console.log('PASS: ' + name); }
  else { fail++; failures.push(name); console.log('FAIL: ' + name + (extra ? ' :: ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function bodyText(page) { return await page.evaluate(() => document.body.innerText); }

(async () => {
  const browser = await firefox.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const external = [];
  const consoleErrors = [];
  const pageErrors = [];
  page.on('request', r => { if (!r.url().startsWith('https://adilmhr1262.github.io/care-routine/')) external.push(r.url()); });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'load' });
  await sleep(1200);

  check('live title', (await page.title()).includes('CareRoutine'));
  check('live empty state', (await bodyText(page)).includes('Nothing scheduled yet'));
  check('live total 0', (await page.evaluate(() => document.querySelector('#statTotal').textContent)) === '0');

  // create a routine live
  await page.click('.sidebar [data-view="routines"]');
  await sleep(300);
  await page.click('#addRoutineBtn');
  await page.fill('#routineName', 'Change bedsheets');
  await page.selectOption('#routineCategory', 'Cleaning');
  await page.fill('#routineInterval', '1');
  await page.selectOption('#routineUnit', 'weeks');
  await page.click('#routineForm button[type="submit"]');
  await sleep(600);
  check('live routine created', (await bodyText(page)).includes('Change bedsheets'));

  // mark done live
  const rid = await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('careroutine', 1);
    req.onsuccess = () => {
      const tx = req.result.transaction('routines', 'readonly');
      const r = tx.objectStore('routines').getAll();
      r.onsuccess = () => { req.result.close(); resolve(r.result[0].id); };
    };
  }));
  await page.click('#view-routines [data-mark-done="' + rid + '"]');
  await sleep(300);
  const today = await page.evaluate(() => {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  });
  await page.fill('#doneDate', today);
  await page.click('#doneForm button[type="submit"]');
  await sleep(600);
  await page.click('.sidebar [data-view="dashboard"]');
  await sleep(400);
  check('live completed this month 1', (await page.evaluate(() => document.querySelector('#statMonth').textContent)) === '1');

  // persistence after reload
  await page.reload({ waitUntil: 'load' });
  await sleep(1200);
  check('live routine persists after reload', (await bodyText(page)).includes('Change bedsheets'));

  // responsive
  await page.setViewportSize({ width: 375, height: 800 });
  await sleep(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('live no overflow at 375px', overflow <= 0, 'overflow ' + overflow);
  check('live bottom nav at 375px', await page.isVisible('.bottom-nav'));

  check('live zero external requests', external.length === 0, external.join(', '));
  check('live zero console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('live zero page errors', pageErrors.length === 0, pageErrors.join(' | '));

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed.' + (failures.length ? ' Failed: ' + failures.join('; ') : ''));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE ERROR', e); process.exit(2); });

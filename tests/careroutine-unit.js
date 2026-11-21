/* CareRoutine Node unit checks for date-utils.js and backup.js.
   Usage: node tests/careroutine-unit.js */
const D = require('../date-utils.js');
const BK = require('../backup.js');

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, extra) {
  if (ok) { pass++; console.log('PASS: ' + name); }
  else { fail++; failures.push(name); console.log('FAIL: ' + name + (extra ? ' :: ' + extra : '')); }
}

// --- date validity ---
check('valid date', D.isValidDateStr('2026-11-21'));
check('reject month 13', !D.isValidDateStr('2026-13-01'));
check('reject Feb 30', !D.isValidDateStr('2026-02-30'));
check('accept Feb 29 leap', D.isValidDateStr('2024-02-29'));
check('reject Feb 29 non-leap', !D.isValidDateStr('2027-02-29'));
check('reject garbage', !D.isValidDateStr('not-a-date'));
check('leap 2024', D.isLeapYear(2024));
check('not leap 2027', !D.isLeapYear(2027));
check('leap 2000', D.isLeapYear(2000));
check('not leap 1900', !D.isLeapYear(1900));
check('days in Feb 2027', D.daysInMonth(2027, 2) === 28);
check('days in Feb 2024', D.daysInMonth(2024, 2) === 29);

// --- recurrence ---
check('add 7 days', D.addDays('2026-11-21', 7) === '2026-11-28');
check('add days over month', D.addDays('2026-11-28', 5) === '2026-12-03');
check('add days over year', D.addDays('2026-12-30', 5) === '2027-01-04');
check('add 2 weeks', D.addWeeks('2026-11-21', 2) === '2026-12-05');
check('Jan 31 + 1 month = Feb 28 (2027)', D.addMonths('2027-01-31', 1) === '2027-02-28');
check('Jan 31 + 1 month = Feb 29 (2024 leap)', D.addMonths('2024-01-31', 1) === '2024-02-29');
check('Mar 31 - 1 month = Feb 28 (2027)', D.addMonths('2027-03-31', -1) === '2027-02-28');
check('add 3 months', D.addMonths('2026-11-21', 3) === '2027-02-21');
check('add 12 months', D.addMonths('2026-02-28', 12) === '2027-02-28');
check('add interval weeks', D.addInterval('2026-11-21', 2, 'weeks') === '2026-12-05');
check('add interval months', D.addInterval('2027-01-31', 1, 'months') === '2027-02-28');
check('add interval bad unit null', D.addInterval('2026-11-21', 1, 'years') === null);

// --- comparisons ---
check('compare earlier', D.compareDates('2026-11-20', '2026-11-21') === -1);
check('compare equal', D.compareDates('2026-11-21', '2026-11-21') === 0);
check('compare later', D.compareDates('2026-11-22', '2026-11-21') === 1);
check('days between', D.daysBetween('2026-11-21', '2026-11-28') === 7);
check('days between negative', D.daysBetween('2026-11-28', '2026-11-21') === -7);
check('format date', D.formatDate('2026-11-21') === 'Nov 21, 2026');
check('frequency daily', D.formatFrequency(1, 'days') === 'Every day');
check('frequency weekly', D.formatFrequency(1, 'weeks') === 'Every week');
check('frequency monthly', D.formatFrequency(1, 'months') === 'Every month');
check('frequency 3 weeks', D.formatFrequency(3, 'weeks') === 'Every 3 weeks');

// --- routine validation ---
const TODAY = '2026-11-21';
const good = { name: 'Clean AC filter', category: 'Appliances', intervalValue: 1, intervalUnit: 'months', startDate: null, lastDoneDate: null, notes: '', paused: false };
check('routine ok', D.validateRoutine(good, TODAY).length === 0);
check('name 1 char rejected', D.validateRoutine(Object.assign({}, good, { name: 'x' }), TODAY).length === 1);
check('name 101 chars rejected', D.validateRoutine(Object.assign({}, good, { name: 'a'.repeat(101) }), TODAY).length === 1);
check('bad category rejected', D.validateRoutine(Object.assign({}, good, { category: 'Pets' }), TODAY).length === 1);
check('interval 0 rejected', D.validateRoutine(Object.assign({}, good, { intervalValue: 0 }), TODAY).length === 1);
check('interval 366 days rejected', D.validateRoutine(Object.assign({}, good, { intervalValue: 366, intervalUnit: 'days' }), TODAY).length === 1);
check('interval 365 days ok', D.validateRoutine(Object.assign({}, good, { intervalValue: 365, intervalUnit: 'days' }), TODAY).length === 0);
check('interval 53 weeks rejected', D.validateRoutine(Object.assign({}, good, { intervalValue: 53, intervalUnit: 'weeks' }), TODAY).length === 1);
check('future last done rejected', D.validateRoutine(Object.assign({}, good, { lastDoneDate: '2026-11-22' }), TODAY).length === 1);
check('past last done ok', D.validateRoutine(Object.assign({}, good, { lastDoneDate: '2026-11-20' }), TODAY).length === 0);
check('notes 501 rejected', D.validateRoutine(Object.assign({}, good, { notes: 'n'.repeat(501) }), TODAY).length === 1);
check('bad start date rejected', D.validateRoutine(Object.assign({}, good, { startDate: '2026-02-30' }), TODAY).length === 1);

// --- completion validation ---
check('completion ok', D.validateCompletion({ routineId: 'r1', date: '2026-11-21', note: '' }, TODAY).length === 0);
check('future completion rejected', D.validateCompletion({ routineId: 'r1', date: '2026-11-22', note: '' }, TODAY).length === 1);
check('completion no routine rejected', D.validateCompletion({ routineId: '', date: '2026-11-21', note: '' }, TODAY).length === 1);

// --- next due + status ---
const rWeekly = { id: 'r1', name: 'Bedsheets', category: 'Cleaning', intervalValue: 1, intervalUnit: 'weeks', startDate: null, notes: '', paused: false, createdDate: '2026-11-14' };
check('next due from creation', D.nextDueDate(rWeekly, []) === '2026-11-21');
check('status due today', D.routineStatus(rWeekly, [], TODAY) === 'Due Today');
check('next due from last completion', D.nextDueDate(rWeekly, [{ date: '2026-11-14' }]) === '2026-11-21');
check('next due weekly after completion', D.nextDueDate(rWeekly, [{ date: '2026-11-15' }]) === '2026-11-22');
check('status upcoming', D.routineStatus(rWeekly, [{ date: '2026-11-15' }], TODAY) === 'Upcoming');
check('status overdue', D.routineStatus(rWeekly, [{ date: '2026-11-01' }], TODAY) === 'Overdue');
const rStart = { id: 'r2', name: 'Toothbrush', category: 'Hygiene', intervalValue: 3, intervalUnit: 'months', startDate: '2026-12-01', notes: '', paused: false, createdDate: '2026-11-21' };
check('next due from start date', D.nextDueDate(rStart, []) === '2026-12-01');
check('status upcoming from start', D.routineStatus(rStart, [], TODAY) === 'Upcoming');
const rMonthly = { id: 'r3', name: 'AC filter', category: 'Appliances', intervalValue: 1, intervalUnit: 'months', startDate: null, notes: '', paused: false, createdDate: '2026-10-31' };
check('monthly clamp on due', D.nextDueDate(rMonthly, [{ date: '2027-01-31' }]) === '2027-02-28');
const rPaused = Object.assign({}, rWeekly, { paused: true });
check('paused status', D.routineStatus(rPaused, [], TODAY) === 'Paused');
check('latest completion picks max', D.latestCompletionDate([{ date: '2026-11-01' }, { date: '2026-11-15' }, { date: '2026-11-10' }]) === '2026-11-15');
check('latest completion empty null', D.latestCompletionDate([]) === null);

// --- dashboard stats ---
const routines = [
  { id: 'a', name: 'Bedsheets', category: 'Cleaning', intervalValue: 1, intervalUnit: 'weeks', startDate: null, paused: false, createdDate: '2026-11-14' },
  { id: 'b', name: 'Water bottle', category: 'Hygiene', intervalValue: 1, intervalUnit: 'days', startDate: null, paused: false, createdDate: '2026-11-20' },
  { id: 'c', name: 'Car service', category: 'Vehicle', intervalValue: 1, intervalUnit: 'months', startDate: null, paused: true, createdDate: '2026-10-01' }
];
const completions = [
  { id: 'c1', routineId: 'a', date: '2026-11-14', note: '' },
  { id: 'c2', routineId: 'b', date: '2026-11-20', note: '' },
  { id: 'c3', routineId: 'b', date: '2026-10-05', note: '' }
];
const stats = D.dashboardStats(routines, completions, TODAY);
check('stats total 3', stats.total === 3);
check('stats due today 2 (A weekly + B daily)', stats.dueToday === 2, JSON.stringify(stats));
check('stats overdue 0', stats.overdue === 0, JSON.stringify(stats));
check('stats completed this month 2', stats.completedThisMonth === 2, JSON.stringify(stats));
const att = D.needsAttention(routines, completions, TODAY, 5);
check('attention has A and B, A first', att.length === 2 && att[0].routine.id === 'a' && att[1].routine.id === 'b', JSON.stringify(att.map(function (x) { return x.routine.id; })));
// overdue ordering: B's latest completion moves back to 2026-11-10
const completionsOld = [
  { id: 'c1', routineId: 'a', date: '2026-11-14', note: '' },
  { id: 'c2', routineId: 'b', date: '2026-11-10', note: '' },
  { id: 'c3', routineId: 'b', date: '2026-10-05', note: '' }
];
const stats2 = D.dashboardStats(routines, completionsOld, TODAY);
check('stats2 overdue 1 (B)', stats2.overdue === 1, JSON.stringify(stats2));
check('stats2 due today 1 (A)', stats2.dueToday === 1, JSON.stringify(stats2));
const att2 = D.needsAttention(routines, completionsOld, TODAY, 5);
check('attention overdue first', att2.length === 2 && att2[0].routine.id === 'b' && att2[1].routine.id === 'a', JSON.stringify(att2.map(function (x) { return x.routine.id; })));

// --- backup ---
const backup = BK.buildBackup(routines, completions, { theme: 'dark' });
check('backup schema 1', backup.schema === 1 && backup.app === 'careroutine');
check('backup valid', BK.validateBackup(backup).length === 0, JSON.stringify(BK.validateBackup(backup)));
check('backup schema 99 rejected', BK.validateBackup(Object.assign({}, backup, { schema: 99 })).length > 0);
check('backup wrong app rejected', BK.validateBackup(Object.assign({}, backup, { app: 'other' })).length > 0);
check('backup bad routine rejected', BK.validateBackup(Object.assign({}, backup, { routines: [Object.assign({}, routines[0], { category: 'Pets' })] })).length > 0);
check('backup unknown routine ref rejected', BK.validateBackup(Object.assign({}, backup, { completions: [{ id: 'x', routineId: 'nope', date: '2026-11-21', note: '' }] })).length > 0);
check('backup future completion rejected', BK.validateBackup(Object.assign({}, backup, { completions: [{ id: 'x', routineId: 'a', date: '2027-01-01', note: '' }] })).length > 0);
check('backup dup routine id rejected', BK.validateBackup(Object.assign({}, backup, { routines: [routines[0], routines[0]] })).length > 0);
check('backup bad theme rejected', BK.validateBackup(Object.assign({}, backup, { settings: { theme: 'neon' } })).length > 0);
check('backup not object rejected', BK.validateBackup('junk').length > 0);
check('backup missing lists rejected', BK.validateBackup({ schema: 1, app: 'careroutine' }).length > 0);

// --- CSV ---
check('csv neutralises =', BK.sanitizeCsvCell('=2+2') === "'=2+2");
check('csv neutralises +', BK.sanitizeCsvCell('+cmd') === "'+cmd");
check('csv neutralises -', BK.sanitizeCsvCell('-cmd') === "'-cmd");
check('csv neutralises @', BK.sanitizeCsvCell('@cmd') === "'@cmd");
check('csv neutralises tab', BK.sanitizeCsvCell('\t=cmd') === "'\t=cmd");
check('csv leaves plain', BK.sanitizeCsvCell('Clean AC filter') === 'Clean AC filter');
check('csv quotes commas', BK.sanitizeCsvCell('a,b') === '"a,b"');
check('csv escapes quotes', BK.sanitizeCsvCell('say "hi"') === '"say ""hi"""');
const csv = BK.completionsToCsv(routines, completions);
check('csv header', csv.split('\r\n')[0] === 'Routine,Category,Date,Note', csv.split('\r\n')[0]);
check('csv has rows', csv.indexOf('Bedsheets,Cleaning,2026-11-14,') !== -1);
check('csv formula name neutralised', BK.completionsToCsv([{ id: 'z', name: '=EVIL', category: 'Home' }], [{ id: 'c9', routineId: 'z', date: '2026-11-21', note: '' }]).indexOf("'=EVIL") !== -1);

console.log('\n' + pass + ' passed, ' + fail + ' failed.' + (failures.length ? ' Failed: ' + failures.join('; ') : ''));
process.exit(fail ? 1 : 0);

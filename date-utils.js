/* CareRoutine date utilities.
   All scheduling uses LOCAL calendar dates (YYYY-MM-DD). No UTC timestamp
   comparisons. Pure functions, safe in Node and in the browser. */
(function (root) {
  'use strict';

  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  function daysInMonth(y, m) {
    // m is 1-12
    var table = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return table[m - 1];
  }

  function isValidDateStr(s) {
    if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
    var y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
    if (m < 1 || m > 12) return false;
    if (d < 1 || d > daysInMonth(y, m)) return false;
    return true;
  }

  function parseDate(s) {
    if (!isValidDateStr(s)) return null;
    return { y: +s.slice(0, 4), m: +s.slice(5, 7), d: +s.slice(8, 10) };
  }

  function toDate(s) {
    var p = parseDate(s);
    if (!p) return null;
    return new Date(p.y, p.m - 1, p.d);
  }

  function fromDate(dt) {
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  }

  function todayLocal(now) {
    var d = now instanceof Date ? now : new Date();
    return fromDate(d);
  }

  function compareDates(a, b) {
    if (!isValidDateStr(a) || !isValidDateStr(b)) return null;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  function addDays(dateStr, n) {
    var dt = toDate(dateStr);
    if (!dt) return null;
    dt.setDate(dt.getDate() + n);
    return fromDate(dt);
  }

  function addWeeks(dateStr, n) {
    return addDays(dateStr, n * 7);
  }

  function addMonths(dateStr, n) {
    var p = parseDate(dateStr);
    if (!p) return null;
    var total = (p.y * 12 + (p.m - 1)) + n;
    var y = Math.floor(total / 12);
    var m = (total % 12) + 1;
    var d = Math.min(p.d, daysInMonth(y, m));
    return y + '-' + pad(m) + '-' + pad(d);
  }

  function addInterval(dateStr, value, unit) {
    if (unit === 'days') return addDays(dateStr, value);
    if (unit === 'weeks') return addWeeks(dateStr, value);
    if (unit === 'months') return addMonths(dateStr, value);
    return null;
  }

  function daysBetween(a, b) {
    var da = toDate(a), db = toDate(b);
    if (!da || !db) return null;
    return Math.round((db - da) / 86400000);
  }

  function formatDate(dateStr) {
    var p = parseDate(dateStr);
    if (!p) return dateStr;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[p.m - 1] + ' ' + p.d + ', ' + p.y;
  }

  function formatFrequency(value, unit) {
    if (value === 1) {
      if (unit === 'days') return 'Every day';
      if (unit === 'weeks') return 'Every week';
      return 'Every month';
    }
    var label = unit === 'days' ? 'days' : unit === 'weeks' ? 'weeks' : 'months';
    return 'Every ' + value + ' ' + label;
  }

  var CATEGORIES = ['Cleaning', 'Hygiene', 'Appliances', 'Vehicle', 'Home', 'Other'];
  var UNITS = ['days', 'weeks', 'months'];

  function validateRoutine(r, todayStr) {
    var errors = [];
    if (!r || typeof r !== 'object') return ['Routine is missing.'];
    if (typeof r.name !== 'string' || r.name.trim().length < 2 || r.name.trim().length > 100) {
      errors.push('Name must be 2-100 characters.');
    }
    if (CATEGORIES.indexOf(r.category) === -1) errors.push('Category is not recognised.');
    if (UNITS.indexOf(r.intervalUnit) === -1) errors.push('Repeat unit must be days, weeks or months.');
    if (!Number.isInteger(r.intervalValue) || r.intervalValue < 1) {
      errors.push('Repeat interval must be a whole number of 1 or more.');
    } else {
      var max = r.intervalUnit === 'days' ? 365 : r.intervalUnit === 'weeks' ? 52 : 24;
      if (r.intervalValue > max) errors.push('Repeat interval is too large.');
    }
    if (r.startDate !== null && r.startDate !== undefined && r.startDate !== '') {
      if (!isValidDateStr(r.startDate)) errors.push('Start date is not a valid date.');
    }
    if (r.lastDoneDate !== null && r.lastDoneDate !== undefined && r.lastDoneDate !== '') {
      if (!isValidDateStr(r.lastDoneDate)) errors.push('Last done date is not a valid date.');
      else if (todayStr && compareDates(r.lastDoneDate, todayStr) > 0) errors.push('Last done date cannot be in the future.');
    }
    if (r.notes !== null && r.notes !== undefined && String(r.notes).length > 500) {
      errors.push('Notes must be 500 characters or fewer.');
    }
    if (typeof r.paused !== 'boolean') errors.push('Paused flag must be true or false.');
    return errors;
  }

  function validateCompletion(c, todayStr) {
    var errors = [];
    if (!c || typeof c !== 'object') return ['Completion is missing.'];
    if (typeof c.routineId !== 'string' || !c.routineId) errors.push('Completion needs a routine.');
    if (!isValidDateStr(c.date)) errors.push('Completion date is not a valid date.');
    else if (todayStr && compareDates(c.date, todayStr) > 0) errors.push('Completion date cannot be in the future.');
    if (c.note !== null && c.note !== undefined && String(c.note).length > 500) {
      errors.push('Note must be 500 characters or fewer.');
    }
    return errors;
  }

  function latestCompletionDate(completions) {
    var latest = null;
    for (var i = 0; i < completions.length; i++) {
      var d = completions[i].date;
      if (isValidDateStr(d) && (latest === null || d > latest)) latest = d;
    }
    return latest;
  }

  /* Next due: from the latest completion if one exists, else from the
     initial scheduled (start) date, else from the creation date plus one
     interval. */
  function nextDueDate(routine, completions) {
    var anchor = null;
    var latest = latestCompletionDate(completions || []);
    if (latest) anchor = latest;
    else if (routine.startDate) anchor = routine.startDate;
    else if (routine.createdDate) anchor = routine.createdDate;
    else return null;
    if (latest) return addInterval(anchor, routine.intervalValue, routine.intervalUnit);
    if (routine.startDate) return routine.startDate;
    return addInterval(anchor, routine.intervalValue, routine.intervalUnit);
  }

  function routineStatus(routine, completions, todayStr) {
    if (routine.paused) return 'Paused';
    var due = nextDueDate(routine, completions);
    if (!due) return 'Upcoming';
    var cmp = compareDates(due, todayStr);
    if (cmp < 0) return 'Overdue';
    if (cmp === 0) return 'Due Today';
    return 'Upcoming';
  }

  function dashboardStats(routines, completions, todayStr) {
    var total = routines.length;
    var dueToday = 0, overdue = 0;
    var byRoutine = {};
    for (var i = 0; i < completions.length; i++) {
      var c = completions[i];
      (byRoutine[c.routineId] = byRoutine[c.routineId] || []).push(c);
    }
    for (var j = 0; j < routines.length; j++) {
      var st = routineStatus(routines[j], byRoutine[routines[j].id] || [], todayStr);
      if (st === 'Due Today') dueToday++;
      if (st === 'Overdue') overdue++;
    }
    var month = todayStr.slice(0, 7);
    var completedThisMonth = 0;
    for (var k = 0; k < completions.length; k++) {
      if (completions[k].date.slice(0, 7) === month) completedThisMonth++;
    }
    return { total: total, dueToday: dueToday, overdue: overdue, completedThisMonth: completedThisMonth };
  }

  /* Routines needing attention: overdue first, then nearest due date. */
  function needsAttention(routines, completions, todayStr, limit) {
    var byRoutine = {};
    for (var i = 0; i < completions.length; i++) {
      var c = completions[i];
      (byRoutine[c.routineId] = byRoutine[c.routineId] || []).push(c);
    }
    var rows = [];
    for (var j = 0; j < routines.length; j++) {
      var r = routines[j];
      if (r.paused) continue;
      var due = nextDueDate(r, byRoutine[r.id] || []);
      if (!due) continue;
      var st = routineStatus(r, byRoutine[r.id] || [], todayStr);
      if (st === 'Overdue' || st === 'Due Today') {
        rows.push({ routine: r, due: due, status: st });
      }
    }
    rows.sort(function (a, b) {
      var rank = { 'Overdue': 0, 'Due Today': 1 };
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      if (a.due < b.due) return -1;
      if (a.due > b.due) return 1;
      return a.routine.name.localeCompare(b.routine.name);
    });
    return rows.slice(0, limit || 5);
  }

  var api = {
    pad: pad, isLeapYear: isLeapYear, daysInMonth: daysInMonth,
    isValidDateStr: isValidDateStr, parseDate: parseDate, todayLocal: todayLocal,
    compareDates: compareDates, addDays: addDays, addWeeks: addWeeks,
    addMonths: addMonths, addInterval: addInterval, daysBetween: daysBetween,
    formatDate: formatDate, formatFrequency: formatFrequency,
    CATEGORIES: CATEGORIES, UNITS: UNITS,
    validateRoutine: validateRoutine, validateCompletion: validateCompletion,
    latestCompletionDate: latestCompletionDate, nextDueDate: nextDueDate,
    routineStatus: routineStatus, dashboardStats: dashboardStats,
    needsAttention: needsAttention
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CareRoutineDates = api;
})(typeof window !== 'undefined' ? window : globalThis);

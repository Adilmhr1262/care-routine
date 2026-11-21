/* CareRoutine backup: JSON export/import validation and CSV export.
   Pure functions, safe in Node and in the browser. Depends on
   CareRoutineDates (date-utils.js) when loaded in the browser; in Node it
   is required from ./date-utils.js. */
(function (root, factory) {
  'use strict';
  var D = null;
  if (typeof module !== 'undefined' && module.exports) {
    D = require('./date-utils.js');
    module.exports = factory(D);
  } else {
    D = root.CareRoutineDates;
    root.CareRoutineBackup = factory(D);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (D) {
  'use strict';

  var APP = 'careroutine';
  var SCHEMA = 1;

  function buildBackup(routines, completions, settings) {
    return {
      schema: SCHEMA,
      app: APP,
      exportedAt: new Date().toISOString(),
      routines: routines || [],
      completions: completions || [],
      settings: settings || {}
    };
  }

  /* Full validation before any replace. Returns an array of error strings;
     empty means the backup is safe to restore. */
  function validateBackup(data) {
    var errors = [];
    if (!data || typeof data !== 'object' || Array.isArray(data)) return ['Backup file is not a JSON object.'];
    if (data.schema !== SCHEMA) errors.push('Unsupported backup schema: ' + data.schema + ' (expected ' + SCHEMA + ').');
    if (data.app !== APP) errors.push('This backup is for a different app.');
    if (!Array.isArray(data.routines)) errors.push('Backup routines must be a list.');
    if (!Array.isArray(data.completions)) errors.push('Backup completions must be a list.');
    if (data.settings !== undefined && (typeof data.settings !== 'object' || data.settings === null || Array.isArray(data.settings))) {
      errors.push('Backup settings must be an object.');
    }
    if (errors.length) return errors;

    var routineIds = {};
    var today = D.todayLocal();
    for (var i = 0; i < data.routines.length; i++) {
      var r = data.routines[i];
      if (!r || typeof r !== 'object') { errors.push('Routine #' + (i + 1) + ' is not an object.'); continue; }
      if (typeof r.id !== 'string' || !r.id) errors.push('Routine #' + (i + 1) + ' has no id.');
      else if (routineIds[r.id]) errors.push('Duplicate routine id: ' + r.id);
      else routineIds[r.id] = true;
      if (!D.isValidDateStr(r.createdDate)) errors.push('Routine "' + (r.name || r.id) + '" has no valid creation date.');
      var verrs = D.validateRoutine(r, today);
      for (var v = 0; v < verrs.length; v++) errors.push('Routine "' + (r.name || r.id) + '": ' + verrs[v]);
    }
    var completionIds = {};
    for (var j = 0; j < data.completions.length; j++) {
      var c = data.completions[j];
      if (!c || typeof c !== 'object') { errors.push('Completion #' + (j + 1) + ' is not an object.'); continue; }
      if (typeof c.id !== 'string' || !c.id) errors.push('Completion #' + (j + 1) + ' has no id.');
      else if (completionIds[c.id]) errors.push('Duplicate completion id: ' + c.id);
      else completionIds[c.id] = true;
      if (!routineIds[c.routineId]) errors.push('Completion #' + (j + 1) + ' refers to an unknown routine.');
      var cerrs = D.validateCompletion(c, today);
      for (var w = 0; w < cerrs.length; w++) errors.push('Completion #' + (j + 1) + ': ' + cerrs[w]);
    }
    if (data.settings && data.settings.theme !== undefined &&
        ['light', 'dark', 'system'].indexOf(data.settings.theme) === -1) {
      errors.push('Backup theme setting is not recognised.');
    }
    return errors;
  }

  /* Neutralise spreadsheet formula injection in exported CSV cells. */
  function sanitizeCsvCell(value) {
    var s = value === null || value === undefined ? '' : String(value);
    if (/^[\s]*[=+\-@\t\r\n]/.test(s)) s = "'" + s;
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function completionsToCsv(routines, completions) {
    var names = {};
    for (var i = 0; i < routines.length; i++) names[routines[i].id] = routines[i].name;
    var lines = ['Routine,Category,Date,Note'];
    var sorted = completions.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return 0;
    });
    for (var j = 0; j < sorted.length; j++) {
      var c = sorted[j];
      var r = null;
      for (var k = 0; k < routines.length; k++) if (routines[k].id === c.routineId) { r = routines[k]; break; }
      lines.push([
        sanitizeCsvCell(names[c.routineId] || '(deleted routine)'),
        sanitizeCsvCell(r ? r.category : ''),
        sanitizeCsvCell(c.date),
        sanitizeCsvCell(c.note || '')
      ].join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }

  return {
    APP: APP, SCHEMA: SCHEMA,
    buildBackup: buildBackup,
    validateBackup: validateBackup,
    sanitizeCsvCell: sanitizeCsvCell,
    completionsToCsv: completionsToCsv
  };
});

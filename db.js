/* CareRoutine IndexedDB layer. Database "careroutine", version 1.
   Stores: routines (keyPath id), completions (keyPath id, indexes routineId
   and date), settings (keyPath key). Browser only. */
(function (root) {
  'use strict';

  var DB_NAME = 'careroutine';
  var DB_VERSION = 1;

  function uid() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('routines')) {
          db.createObjectStore('routines', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('completions')) {
          var cs = db.createObjectStore('completions', { keyPath: 'id' });
          cs.createIndex('routineId', 'routineId', { unique: false });
          cs.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error('Transaction aborted')); };
    });
  }

  function reqDone(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  async function getAll(storeName) {
    var db = await openDb();
    try {
      var rows = await reqDone(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
      return rows;
    } finally { db.close(); }
  }

  async function put(storeName, value) {
    var db = await openDb();
    try {
      var tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      await txDone(tx);
    } finally { db.close(); }
  }

  async function remove(storeName, key) {
    var db = await openDb();
    try {
      var tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      await txDone(tx);
    } finally { db.close(); }
  }

  async function getAllRoutines() {
    var rows = await getAll('routines');
    rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return rows;
  }

  async function getAllCompletions() {
    var rows = await getAll('completions');
    rows.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return 0;
    });
    return rows;
  }

  async function addRoutine(routine) {
    routine.id = uid();
    await put('routines', routine);
    return routine;
  }

  async function updateRoutine(routine) {
    await put('routines', routine);
    return routine;
  }

  /* Delete a routine and every completion tied to it, atomically. */
  async function deleteRoutine(routineId) {
    var db = await openDb();
    try {
      var tx = db.transaction(['routines', 'completions'], 'readwrite');
      tx.objectStore('routines').delete(routineId);
      var idx = tx.objectStore('completions').index('routineId');
      var keysReq = idx.getAllKeys(routineId);
      keysReq.onsuccess = function () {
        var store = tx.objectStore('completions');
        for (var i = 0; i < keysReq.result.length; i++) store.delete(keysReq.result[i]);
      };
      await txDone(tx);
    } finally { db.close(); }
  }

  /* Mark a routine done on a date. Returns { completion, duplicate }.
     A second completion for the same routine on the same date is a
     duplicate and is not stored, so rapid clicks cannot double-record. */
  async function addCompletion(routineId, date, note) {
    var db = await openDb();
    try {
      var tx = db.transaction('completions', 'readwrite');
      var store = tx.objectStore('completions');
      var idx = store.index('routineId');
      var existing = await reqDone(idx.getAll(routineId));
      for (var i = 0; i < existing.length; i++) {
        if (existing[i].date === date) {
          await txDone(tx);
          return { completion: existing[i], duplicate: true };
        }
      }
      var completion = { id: uid(), routineId: routineId, date: date, note: note || '' };
      store.add(completion);
      await txDone(tx);
      return { completion: completion, duplicate: false };
    } finally { db.close(); }
  }

  async function updateCompletion(completion) {
    await put('completions', completion);
    return completion;
  }

  async function deleteCompletion(completionId) {
    await remove('completions', completionId);
  }

  async function getSetting(key) {
    var db = await openDb();
    try {
      var row = await reqDone(db.transaction('settings', 'readonly').objectStore('settings').get(key));
      return row ? row.value : null;
    } finally { db.close(); }
  }

  async function setSetting(key, value) {
    await put('settings', { key: key, value: value });
  }

  async function exportAll() {
    var routines = await getAllRoutines();
    var completions = await getAllCompletions();
    var settingsRows = await getAll('settings');
    var settings = {};
    for (var i = 0; i < settingsRows.length; i++) settings[settingsRows[i].key] = settingsRows[i].value;
    return { routines: routines, completions: completions, settings: settings };
  }

  /* Replace everything with a validated backup, all or nothing. */
  async function replaceAll(data) {
    var db = await openDb();
    try {
      var tx = db.transaction(['routines', 'completions', 'settings'], 'readwrite');
      tx.objectStore('routines').clear();
      tx.objectStore('completions').clear();
      tx.objectStore('settings').clear();
      var rs = tx.objectStore('routines');
      for (var i = 0; i < data.routines.length; i++) rs.add(data.routines[i]);
      var cs = tx.objectStore('completions');
      for (var j = 0; j < data.completions.length; j++) cs.add(data.completions[j]);
      var ss = tx.objectStore('settings');
      var keys = Object.keys(data.settings || {});
      for (var k = 0; k < keys.length; k++) ss.add({ key: keys[k], value: data.settings[keys[k]] });
      await txDone(tx);
    } finally { db.close(); }
  }

  async function clearAll() {
    var db = await openDb();
    try {
      var tx = db.transaction(['routines', 'completions', 'settings'], 'readwrite');
      tx.objectStore('routines').clear();
      tx.objectStore('completions').clear();
      tx.objectStore('settings').clear();
      await txDone(tx);
    } finally { db.close(); }
  }

  root.CareRoutineDB = {
    uid: uid,
    getAllRoutines: getAllRoutines,
    getAllCompletions: getAllCompletions,
    addRoutine: addRoutine,
    updateRoutine: updateRoutine,
    deleteRoutine: deleteRoutine,
    addCompletion: addCompletion,
    updateCompletion: updateCompletion,
    deleteCompletion: deleteCompletion,
    getSetting: getSetting,
    setSetting: setSetting,
    exportAll: exportAll,
    replaceAll: replaceAll,
    clearAll: clearAll
  };
})(typeof window !== 'undefined' ? window : globalThis);

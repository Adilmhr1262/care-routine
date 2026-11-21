/* CareRoutine app. Vanilla JS, IndexedDB via CareRoutineDB, dates via
   CareRoutineDates, backup via CareRoutineBackup. No external requests. */
(function () {
  'use strict';

  var D = window.CareRoutineDates;
  var DB = window.CareRoutineDB;
  var BK = window.CareRoutineBackup;

  var state = {
    routines: [],
    completions: [],
    theme: 'system',
    view: 'dashboard',
    search: '',
    filterCategory: '',
    filterStatus: '',
    sort: 'due',
    historyMonth: '',
    historyRoutine: ''
  };

  var markDoneBusy = false;

  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.hidden = true; }, 3500);
  }

  function today() { return D.todayLocal(); }

  function completionsFor(routineId) {
    return state.completions.filter(function (c) { return c.routineId === routineId; });
  }

  function routineById(id) {
    for (var i = 0; i < state.routines.length; i++) {
      if (state.routines[i].id === id) return state.routines[i];
    }
    return null;
  }

  function statusOf(routine) {
    return D.routineStatus(routine, completionsFor(routine.id), today());
  }

  function dueOf(routine) {
    return D.nextDueDate(routine, completionsFor(routine.id));
  }

  function lastDoneOf(routine) {
    return D.latestCompletionDate(completionsFor(routine.id));
  }

  /* ---------- theme ---------- */
  function applyTheme() {
    var mode = state.theme;
    if (mode === 'system') {
      mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', mode);
    $all('input[name="theme"]').forEach(function (r) { r.checked = (r.value === state.theme); });
  }

  async function setTheme(value) {
    state.theme = value;
    await DB.setSetting('theme', value);
    applyTheme();
  }

  /* ---------- views ---------- */
  function showView(name) {
    state.view = name;
    $all('.view').forEach(function (v) { v.classList.toggle('is-active', v.id === 'view-' + name); });
    $all('.nav-btn[data-view]').forEach(function (b) {
      var active = b.getAttribute('data-view') === name;
      b.classList.toggle('is-active', active);
      if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (name === 'dashboard') renderDashboard();
    if (name === 'routines') renderRoutines();
    if (name === 'history') renderHistory();
    if (name === 'settings') renderSettings();
  }

  /* ---------- dashboard ---------- */
  function renderDashboard() {
    var t = today();
    $('#dashDate').textContent = 'Today is ' + D.formatDate(t) + '.';
    var stats = D.dashboardStats(state.routines, state.completions, t);
    $('#statTotal').textContent = String(stats.total);
    $('#statDueToday').textContent = String(stats.dueToday);
    $('#statOverdue').textContent = String(stats.overdue);
    $('#statMonth').textContent = String(stats.completedThisMonth);

    var empty = state.routines.length === 0;
    $('#dashEmpty').hidden = !empty;
    $('#dashContent').hidden = empty;
    if (empty) return;

    var attention = D.needsAttention(state.routines, state.completions, t, 5);
    var attList = $('#attentionList');
    attList.innerHTML = '';
    attention.forEach(function (row) { attList.appendChild(routineCard(row.routine, true)); });
    $('#attentionNone').hidden = attention.length > 0;

    var upcoming = state.routines.filter(function (r) { return statusOf(r) === 'Upcoming'; })
      .map(function (r) { return { routine: r, due: dueOf(r) }; })
      .sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; })
      .slice(0, 5);
    var upList = $('#upcomingList');
    upList.innerHTML = '';
    upcoming.forEach(function (row) { upList.appendChild(routineCard(row.routine, true)); });
    $('#upcomingNone').hidden = upcoming.length > 0;

    var recent = state.completions.slice(0, 5);
    var recList = $('#recentList');
    recList.innerHTML = '';
    recent.forEach(function (c) { recList.appendChild(historyCard(c)); });
    $('#recentNone').hidden = recent.length > 0;
  }

  /* ---------- routine cards ---------- */
  function statusBadge(status) {
    var badge = el('span', 'status-badge status-' + status.replace(' ', ''));
    badge.textContent = status;
    return badge;
  }

  function routineCard(routine, compact) {
    var card = el('article', 'card routine-card');
    var top = el('div', 'routine-top');
    var titleWrap = el('div');
    titleWrap.appendChild(el('h3', 'routine-name', routine.name));
    var meta = el('p', 'routine-meta', routine.category + ' · ' + D.formatFrequency(routine.intervalValue, routine.intervalUnit));
    titleWrap.appendChild(meta);
    top.appendChild(titleWrap);
    top.appendChild(statusBadge(statusOf(routine)));
    card.appendChild(top);

    var dates = el('div', 'routine-dates');
    var last = lastDoneOf(routine);
    var lastWrap = el('div');
    lastWrap.appendChild(el('span', 'label', 'Last done'));
    lastWrap.appendChild(el('span', null, last ? D.formatDate(last) : 'Never'));
    dates.appendChild(lastWrap);
    var due = dueOf(routine);
    var dueWrap = el('div');
    dueWrap.appendChild(el('span', 'label', 'Next due'));
    dueWrap.appendChild(el('span', null, due ? D.formatDate(due) : '—'));
    dates.appendChild(dueWrap);
    card.appendChild(dates);

    if (routine.notes) card.appendChild(el('p', 'routine-notes', routine.notes));

    var actions = el('div', 'routine-actions');
    if (!routine.paused) {
      var doneBtn = el('button', 'btn btn-primary', 'Mark Done');
      doneBtn.type = 'button';
      doneBtn.setAttribute('data-mark-done', routine.id);
      doneBtn.addEventListener('click', function () { openDoneDialog(routine); });
      actions.appendChild(doneBtn);
    }
    var editBtn = el('button', 'btn', 'Edit');
    editBtn.type = 'button';
    editBtn.addEventListener('click', function () { openRoutineDialog(routine); });
    actions.appendChild(editBtn);
    var pauseBtn = el('button', 'btn', routine.paused ? 'Resume' : 'Pause');
    pauseBtn.type = 'button';
    pauseBtn.addEventListener('click', function () { togglePause(routine); });
    actions.appendChild(pauseBtn);
    var delBtn = el('button', 'btn btn-danger', 'Delete');
    delBtn.type = 'button';
    delBtn.addEventListener('click', function () { deleteRoutine(routine); });
    actions.appendChild(delBtn);
    card.appendChild(actions);
    return card;
  }

  function renderRoutines() {
    var q = state.search.trim().toLowerCase();
    var rows = state.routines.map(function (r) {
      return { routine: r, status: statusOf(r), due: dueOf(r), last: lastDoneOf(r) };
    });
    if (q) {
      rows = rows.filter(function (row) {
        return row.routine.name.toLowerCase().indexOf(q) !== -1 ||
          (row.routine.notes || '').toLowerCase().indexOf(q) !== -1 ||
          row.routine.category.toLowerCase().indexOf(q) !== -1;
      });
    }
    if (state.filterCategory) rows = rows.filter(function (row) { return row.routine.category === state.filterCategory; });
    if (state.filterStatus) rows = rows.filter(function (row) { return row.status === state.filterStatus; });

    rows.sort(function (a, b) {
      if (state.sort === 'name') return a.routine.name.localeCompare(b.routine.name);
      if (state.sort === 'category') {
        var c = a.routine.category.localeCompare(b.routine.category);
        return c !== 0 ? c : a.routine.name.localeCompare(b.routine.name);
      }
      if (state.sort === 'lastDone') {
        if (!a.last && !b.last) return a.routine.name.localeCompare(b.routine.name);
        if (!a.last) return 1;
        if (!b.last) return -1;
        return a.last < b.last ? 1 : a.last > b.last ? -1 : 0;
      }
      // due: active first by due date, paused last
      if (a.routine.paused !== b.routine.paused) return a.routine.paused ? 1 : -1;
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due < b.due ? -1 : a.due > b.due ? 1 : a.routine.name.localeCompare(b.routine.name);
    });

    var list = $('#routineList');
    list.innerHTML = '';
    rows.forEach(function (row) { list.appendChild(routineCard(row.routine)); });
    $('#routineEmpty').hidden = state.routines.length > 0;
    $('#routineNoMatch').hidden = !(state.routines.length > 0 && rows.length === 0);
  }

  /* ---------- history ---------- */
  function historyCard(completion) {
    var routine = routineById(completion.routineId);
    var card = el('article', 'card history-card');
    var left = el('div');
    left.appendChild(el('h3', 'routine-name', routine ? routine.name : '(deleted routine)'));
    var meta = el('p', 'routine-meta', D.formatDate(completion.date) + (routine ? ' · ' + routine.category : ''));
    left.appendChild(meta);
    if (completion.note) left.appendChild(el('p', 'history-note', completion.note));
    card.appendChild(left);
    var actions = el('div', 'routine-actions');
    var editBtn = el('button', 'btn', 'Edit');
    editBtn.type = 'button';
    editBtn.addEventListener('click', function () { openEditCompletionDialog(completion); });
    actions.appendChild(editBtn);
    var delBtn = el('button', 'btn btn-danger', 'Delete');
    delBtn.type = 'button';
    delBtn.addEventListener('click', function () { deleteCompletion(completion); });
    actions.appendChild(delBtn);
    card.appendChild(actions);
    return card;
  }

  function renderHistory() {
    var month = state.historyMonth;
    var routineId = state.historyRoutine;
    var rows = state.completions.filter(function (c) {
      if (month && c.date.slice(0, 7) !== month) return false;
      if (routineId && c.routineId !== routineId) return false;
      return true;
    });
    $('#historySummary').textContent = rows.length + (rows.length === 1 ? ' completion' : ' completions') +
      (month || routineId ? ' matching the selected filters.' : ' recorded.');
    var list = $('#historyList');
    list.innerHTML = '';
    rows.forEach(function (c) { list.appendChild(historyCard(c)); });
    $('#historyEmpty').hidden = state.completions.length > 0;
    $('#historyNoMatch').hidden = !(state.completions.length > 0 && rows.length === 0);
  }

  function refreshHistoryRoutineFilter() {
    var sel = $('#filterRoutine');
    var current = sel.value;
    sel.innerHTML = '';
    var all = el('option', null, 'All routines');
    all.value = '';
    sel.appendChild(all);
    state.routines.forEach(function (r) {
      var opt = el('option', null, r.name);
      opt.value = r.id;
      sel.appendChild(opt);
    });
    sel.value = state.routines.some(function (r) { return r.id === current; }) ? current : '';
    state.historyRoutine = sel.value;
  }

  /* ---------- settings ---------- */
  function renderSettings() {
    $('#dataSummary').textContent = state.routines.length + (state.routines.length === 1 ? ' routine' : ' routines') +
      ' · ' + state.completions.length + (state.completions.length === 1 ? ' completion' : ' completions');
  }

  /* ---------- dialogs ---------- */
  function openDialog(dlg) {
    if (typeof dlg.showModal === 'function') dlg.showModal();
  }

  function confirmDialog(title, message, yesLabel) {
    return new Promise(function (resolve) {
      var dlg = $('#confirmDialog');
      $('#confirmTitle').textContent = title;
      $('#confirmMessage').textContent = message;
      $('#confirmYes').textContent = yesLabel || 'Delete';
      var yes = $('#confirmYes');
      function cleanup(result) {
        yes.removeEventListener('click', onYes);
        dlg.removeEventListener('close', onClose);
        resolve(result);
      }
      function onYes() { cleanup(true); }
      function onClose() { cleanup(false); }
      yes.addEventListener('click', onYes);
      dlg.addEventListener('close', onClose);
      openDialog(dlg);
    });
  }

  function fillCategorySelects() {
    var cat = $('#routineCategory');
    cat.innerHTML = '';
    D.CATEGORIES.forEach(function (c) {
      var opt = el('option', null, c);
      opt.value = c;
      cat.appendChild(opt);
    });
    var filter = $('#filterCategory');
    filter.innerHTML = '';
    var all = el('option', null, 'All categories');
    all.value = '';
    filter.appendChild(all);
    D.CATEGORIES.forEach(function (c) {
      var opt = el('option', null, c);
      opt.value = c;
      filter.appendChild(opt);
    });
  }

  function openRoutineDialog(routine) {
    var dlg = $('#routineDialog');
    $('#routineError').hidden = true;
    $('#routineId').value = routine ? routine.id : '';
    $('#routineDialogTitle').textContent = routine ? 'Edit routine' : 'Add routine';
    $('#routineName').value = routine ? routine.name : '';
    $('#routineCategory').value = routine ? routine.category : 'Cleaning';
    $('#routineInterval').value = routine ? String(routine.intervalValue) : '1';
    $('#routineUnit').value = routine ? routine.intervalUnit : 'days';
    $('#routineStartDate').value = routine && routine.startDate ? routine.startDate : '';
    $('#routineLastDone').value = routine ? (lastDoneOf(routine) || '') : '';
    $('#routineNotes').value = routine ? (routine.notes || '') : '';
    $('#routineSubmit').textContent = routine ? 'Save changes' : 'Save routine';
    openDialog(dlg);
    $('#routineName').focus();
  }

  async function saveRoutine(e) {
    e.preventDefault();
    var errBox = $('#routineError');
    var id = $('#routineId').value;
    var existing = id ? routineById(id) : null;
    var formLastDone = $('#routineLastDone').value || null;
    /* The last-done date is stored as a real completion record, not as a
       field on the routine, so the next due date always derives from
       history. On edit, changing it moves the latest completion. */
    var candidate = {
      id: id || DB.uid(),
      name: $('#routineName').value.trim(),
      category: $('#routineCategory').value,
      intervalValue: parseInt($('#routineInterval').value, 10),
      intervalUnit: $('#routineUnit').value,
      startDate: $('#routineStartDate').value || null,
      lastDoneDate: formLastDone,
      notes: $('#routineNotes').value.trim(),
      paused: existing ? existing.paused : false,
      createdDate: existing ? existing.createdDate : today()
    };
    var errors = D.validateRoutine(candidate, today());
    var latest = existing ? completionsFor(existing.id).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0] || null : null;
    if (!errors.length && formLastDone && latest && latest.date !== formLastDone) {
      var clash = completionsFor(existing.id).some(function (c) { return c.id !== latest.id && c.date === formLastDone; });
      if (clash) errors.push('This routine already has a completion on that date.');
    }
    if (errors.length) {
      errBox.textContent = errors.join(' ');
      errBox.hidden = false;
      return;
    }
    if (existing) {
      await DB.updateRoutine(candidate);
      if (formLastDone) {
        if (latest && latest.date !== formLastDone) {
          await DB.updateCompletion({ id: latest.id, routineId: existing.id, date: formLastDone, note: latest.note || '' });
        } else if (!latest) {
          await DB.addCompletion(existing.id, formLastDone, '');
        }
      }
      toast('Routine updated.');
    } else {
      var saved = await DB.addRoutine(candidate);
      if (formLastDone) await DB.addCompletion(saved.id, formLastDone, '');
      toast('Routine added.');
    }
    $('#routineDialog').close();
    await reloadData();
  }

  function openDoneDialog(routine) {
    var dlg = $('#doneDialog');
    $('#doneError').hidden = true;
    $('#doneRoutineId').value = routine.id;
    $('#doneRoutineName').textContent = routine.name + ' · ' + D.formatFrequency(routine.intervalValue, routine.intervalUnit);
    $('#doneDate').value = today();
    $('#doneDate').max = today();
    $('#doneNote').value = '';
    openDialog(dlg);
    $('#doneDate').focus();
  }

  async function saveDone(e) {
    e.preventDefault();
    if (markDoneBusy) return;
    markDoneBusy = true;
    var errBox = $('#doneError');
    try {
      var routineId = $('#doneRoutineId').value;
      var date = $('#doneDate').value;
      var note = $('#doneNote').value.trim();
      var errors = D.validateCompletion({ routineId: routineId, date: date, note: note }, today());
      if (errors.length) {
        errBox.textContent = errors.join(' ');
        errBox.hidden = false;
        return;
      }
      var result = await DB.addCompletion(routineId, date, note);
      $('#doneDialog').close();
      toast(result.duplicate ? 'Already marked done for that date.' : 'Marked done. Next due date updated.');
      await reloadData();
    } finally {
      markDoneBusy = false;
    }
  }

  function openEditCompletionDialog(completion) {
    var dlg = $('#editCompletionDialog');
    $('#editCompletionError').hidden = true;
    var routine = routineById(completion.routineId);
    $('#editCompletionRoutine').textContent = routine ? routine.name : '(deleted routine)';
    $('#editCompletionId').value = completion.id;
    $('#editCompletionDate').value = completion.date;
    $('#editCompletionDate').max = today();
    $('#editCompletionNote').value = completion.note || '';
    openDialog(dlg);
    $('#editCompletionDate').focus();
  }

  async function saveEditCompletion(e) {
    e.preventDefault();
    var errBox = $('#editCompletionError');
    var id = $('#editCompletionId').value;
    var original = null;
    for (var i = 0; i < state.completions.length; i++) {
      if (state.completions[i].id === id) { original = state.completions[i]; break; }
    }
    if (!original) return;
    var date = $('#editCompletionDate').value;
    var note = $('#editCompletionNote').value.trim();
    var errors = D.validateCompletion({ routineId: original.routineId, date: date, note: note }, today());
    if (!errors.length) {
      var clash = state.completions.some(function (c) {
        return c.id !== id && c.routineId === original.routineId && c.date === date;
      });
      if (clash) errors.push('This routine already has a completion on that date.');
    }
    if (errors.length) {
      errBox.textContent = errors.join(' ');
      errBox.hidden = false;
      return;
    }
    await DB.updateCompletion({ id: id, routineId: original.routineId, date: date, note: note });
    $('#editCompletionDialog').close();
    toast('Completion updated. Next due date recalculated.');
    await reloadData();
  }

  async function togglePause(routine) {
    routine.paused = !routine.paused;
    await DB.updateRoutine(routine);
    toast(routine.paused ? 'Routine paused.' : 'Routine resumed.');
    await reloadData();
  }

  async function deleteRoutine(routine) {
    var count = completionsFor(routine.id).length;
    var ok = await confirmDialog('Delete routine?',
      'Delete "' + routine.name + '" and its ' + count + (count === 1 ? ' completion record' : ' completion records') + '? This cannot be undone.',
      'Delete');
    if (!ok) return;
    await DB.deleteRoutine(routine.id);
    toast('Routine deleted.');
    await reloadData();
  }

  async function deleteCompletion(completion) {
    var routine = routineById(completion.routineId);
    var ok = await confirmDialog('Delete completion?',
      'Delete the completion for "' + (routine ? routine.name : 'this routine') + '" on ' + D.formatDate(completion.date) + '? The routine\'s next due date will be recalculated.',
      'Delete');
    if (!ok) return;
    await DB.deleteCompletion(completion.id);
    toast('Completion deleted. Next due date recalculated.');
    await reloadData();
  }

  /* ---------- backup / export ---------- */
  function downloadFile(name, content, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  async function exportJson() {
    var data = await DB.exportAll();
    var backup = BK.buildBackup(data.routines, data.completions, data.settings);
    downloadFile('careroutine-backup.json', JSON.stringify(backup, null, 2), 'application/json');
    var msg = $('#backupMessage');
    msg.textContent = 'Backup exported.';
    msg.className = 'form-message is-ok';
  }

  async function exportCsv() {
    var data = await DB.exportAll();
    downloadFile('careroutine-history.csv', BK.completionsToCsv(data.routines, data.completions), 'text/csv');
    toast('History exported as CSV.');
  }

  async function importJsonFile(file) {
    var msg = $('#backupMessage');
    msg.className = 'form-message';
    var text;
    try {
      text = await file.text();
    } catch (err) {
      msg.textContent = 'Could not read that file.';
      msg.classList.add('is-error');
      return;
    }
    var data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      msg.textContent = 'Backup rejected: the file is not valid JSON. Your data is unchanged.';
      msg.classList.add('is-error');
      return;
    }
    var errors = BK.validateBackup(data);
    if (errors.length) {
      msg.textContent = 'Backup rejected: ' + errors[0] + ' Your data is unchanged.';
      msg.classList.add('is-error');
      return;
    }
    if (state.routines.length > 0 || state.completions.length > 0) {
      var ok = await confirmDialog('Replace all data?',
        'Importing this backup will replace your current ' + state.routines.length + ' routines and ' +
        state.completions.length + ' completions with ' + data.routines.length + ' routines and ' +
        data.completions.length + ' completions from the file.',
        'Replace data');
      if (!ok) return;
    }
    await DB.replaceAll(data);
    if (data.settings && data.settings.theme) state.theme = data.settings.theme;
    applyTheme();
    msg.textContent = 'Backup restored: ' + data.routines.length + ' routines, ' + data.completions.length + ' completions.';
    msg.classList.add('is-ok');
    await reloadData();
  }

  async function deleteAll() {
    await DB.clearAll();
    state.theme = 'system';
    applyTheme();
    $('#deleteAllDialog').close();
    toast('All data deleted.');
    await reloadData();
  }

  /* ---------- data loading / render ---------- */
  async function reloadData() {
    state.routines = await DB.getAllRoutines();
    state.completions = await DB.getAllCompletions();
    refreshHistoryRoutineFilter();
    if (state.view === 'dashboard') renderDashboard();
    if (state.view === 'routines') renderRoutines();
    if (state.view === 'history') renderHistory();
    if (state.view === 'settings') renderSettings();
  }

  function wireEvents() {
    $all('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () { showView(b.getAttribute('data-view')); });
    });
    $('#dashAddBtn').addEventListener('click', function () { openRoutineDialog(null); });
    $('#dashEmptyAddBtn').addEventListener('click', function () { openRoutineDialog(null); });
    $('#addRoutineBtn').addEventListener('click', function () { openRoutineDialog(null); });
    $('#routineForm').addEventListener('submit', saveRoutine);
    $('#doneForm').addEventListener('submit', saveDone);
    $('#editCompletionForm').addEventListener('submit', saveEditCompletion);
    $('#deleteAllForm').addEventListener('submit', function (e) {
      e.preventDefault();
      deleteAll();
    });
    $all('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () {
        var dlg = b.closest('dialog');
        if (dlg) dlg.close();
      });
    });
    $('#routineSearch').addEventListener('input', function (e) {
      state.search = e.target.value;
      renderRoutines();
    });
    $('#filterCategory').addEventListener('change', function (e) {
      state.filterCategory = e.target.value;
      renderRoutines();
    });
    $('#filterStatus').addEventListener('change', function (e) {
      state.filterStatus = e.target.value;
      renderRoutines();
    });
    $('#sortRoutines').addEventListener('change', function (e) {
      state.sort = e.target.value;
      renderRoutines();
    });
    $('#filterMonth').addEventListener('change', function (e) {
      state.historyMonth = e.target.value;
      renderHistory();
    });
    $('#filterMonth').addEventListener('input', function (e) {
      state.historyMonth = e.target.value;
      renderHistory();
    });
    $('#filterRoutine').addEventListener('change', function (e) {
      state.historyRoutine = e.target.value;
      renderHistory();
    });
    $('#clearHistoryFilters').addEventListener('click', function () {
      state.historyMonth = '';
      state.historyRoutine = '';
      $('#filterMonth').value = '';
      $('#filterRoutine').value = '';
      renderHistory();
    });
    $('#exportCsvBtn').addEventListener('click', exportCsv);
    $('#exportJsonBtn').addEventListener('click', exportJson);
    $('#importJsonBtn').addEventListener('click', function () { $('#importJsonInput').click(); });
    $('#importJsonInput').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) importJsonFile(file);
    });
    $all('input[name="theme"]').forEach(function (r) {
      r.addEventListener('change', function () { setTheme(r.value); });
    });
    $('#deleteAllBtn').addEventListener('click', function () {
      $('#deleteAllConfirm').value = '';
      $('#deleteAllYes').disabled = true;
      openDialog($('#deleteAllDialog'));
    });
    $('#deleteAllConfirm').addEventListener('input', function (e) {
      $('#deleteAllYes').disabled = (e.target.value !== 'DELETE');
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (state.theme === 'system') applyTheme();
    });
  }

  async function init() {
    fillCategorySelects();
    wireEvents();
    var savedTheme = await DB.getSetting('theme');
    if (savedTheme) state.theme = savedTheme;
    applyTheme();
    await reloadData();
    showView('dashboard');
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('sw.js'); } catch (err) { /* offline support optional */ }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

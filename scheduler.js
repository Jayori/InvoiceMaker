// ─── State ────────────────────────────────────────────────────────────────────
let _events = [];
let _clients = [];
let _selectedServiceCall = null;
let _editingEventId = null;
let _isRescheduleMode = false;

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function schVerifyPin(e) {
  e.preventDefault();
  const pin = document.getElementById('pin-input').value;
  const btn = document.getElementById('pin-btn');
  const errEl = document.getElementById('pin-error');
  btn.disabled = true; btn.textContent = 'Checking...';
  errEl.style.display = 'none';
  try {
    const res = await fetch('/api/verify-pin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    if (data.ok) {
      sessionStorage.setItem('mgr_auth', '1');
      sessionStorage.setItem('mgr_pin', pin);
      initScheduler();
    } else {
      errEl.style.display = '';
    }
  } catch {
    errEl.textContent = 'Error connecting. Try again.';
    errEl.style.display = '';
  } finally {
    btn.disabled = false; btn.textContent = 'Enter';
  }
}

async function initScheduler() {
  document.getElementById('pin-modal').style.display = 'none';
  document.getElementById('sch-app').style.display = '';
  // Load business name
  try {
    const res = await fetch('/api/get-business-profile');
    if (res.ok) {
      const profile = await res.json();
      const name = profile.name || 'Invoice Pro';
      document.getElementById('pin-biz-name').textContent = name;
    }
  } catch {}
  // Load clients for autocomplete
  loadClients();
  // Load events
  loadEvents();
  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('new-event-date').value = today;
}

// ─── Clients ──────────────────────────────────────────────────────────────────
async function loadClients() {
  try {
    const res = await fetch('/api/get-clients');
    if (res.ok) _clients = await res.json();
  } catch {}
}

function onClientNameInput(val) {
  const el = document.getElementById('client-suggestions');
  if (!val.trim() || val.length < 2) { el.style.display = 'none'; return; }
  const matches = _clients.filter(c => c.name.toLowerCase().includes(val.toLowerCase())).slice(0, 5);
  if (!matches.length) { el.style.display = 'none'; return; }
  el.innerHTML = matches.map(c => `
    <div class="sch-suggestion-item" onclick="selectClient(${JSON.stringify(c).replace(/"/g, '&quot;')})">
      <div class="sch-sug-name">${esc(c.name)}</div>
      <div class="sch-sug-meta">${esc(c.email)}${c.phone ? ' · ' + esc(c.phone) : ''}</div>
    </div>`).join('');
  el.style.display = '';
}

function selectClient(c) {
  document.getElementById('new-client-name').value = c.name;
  document.getElementById('new-client-email').value = c.email || '';
  if (c.phone) {
    // Try to parse phone
    let phone = c.phone.replace(/[^\d]/g, '');
    if (phone.startsWith('1') && phone.length === 11) phone = phone.slice(1);
    document.getElementById('new-client-phone').value = phone;
  }
  document.getElementById('client-suggestions').style.display = 'none';
}

// ─── Events list ──────────────────────────────────────────────────────────────
async function loadEvents() {
  const loadingEl = document.getElementById('sch-loading');
  const emptyEl = document.getElementById('sch-empty');
  const eventsEl = document.getElementById('sch-events');
  loadingEl.style.display = '';
  emptyEl.style.display = 'none';
  eventsEl.style.display = 'none';

  try {
    const res = await fetch('/api/get-scheduled-events?upcoming=1');
    _events = res.ok ? await res.json() : [];
  } catch { _events = []; }

  loadingEl.style.display = 'none';

  const standaloneEvents = _events.filter(e => e.type === 'event');
  if (!standaloneEvents.length) {
    emptyEl.style.display = '';
    return;
  }

  eventsEl.style.display = '';
  renderEvents(standaloneEvents, eventsEl);
}

function renderEvents(events, container) {
  // Group by date
  const groups = {};
  events.forEach(e => {
    const d = new Date(e.scheduled_at);
    const key = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });

  container.innerHTML = Object.entries(groups).map(([date, evts]) => `
    <div class="sch-date-group">
      <div class="sch-date-label">${esc(date)}</div>
      ${evts.map(e => renderEventCard(e)).join('')}
    </div>`).join('');
}

function renderEventCard(e) {
  const time = new Date(e.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const durLabel = e.duration_mins >= 60
    ? (e.duration_mins / 60) + 'h'
    : e.duration_mins + 'm';
  const scBadge = e.service_call?.amount
    ? `<span class="sch-sc-badge">$${Number(e.service_call.amount).toFixed(0)} fee</span>`
    : '';
  const statusClass = e.status === 'completed' ? 'sch-status-done' : 'sch-status-sched';
  return `
    <div class="sch-event-card" onclick="openDetailSheet(${JSON.stringify(e.id).replace(/"/g, '&quot;')})">
      <div class="sch-event-time">
        <div class="sch-event-time-val">${esc(time)}</div>
        <div class="sch-event-dur">${esc(durLabel)}</div>
      </div>
      <div class="sch-event-body">
        <div class="sch-event-name">${esc(e.client_name)}</div>
        ${e.notes ? `<div class="sch-event-notes">${esc(e.notes)}</div>` : ''}
        <div class="sch-event-meta">
          <span class="${statusClass}">${e.status}</span>
          ${scBadge}
        </div>
      </div>
      <div class="sch-event-chevron">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
      </div>
    </div>`;
}

// ─── New Event Sheet ──────────────────────────────────────────────────────────
function openNewEventSheet() {
  _editingEventId = null;
  _isRescheduleMode = false;
  clearNewEventForm();
  document.getElementById('new-event-sheet-title').textContent = 'New Event';
  document.getElementById('new-event-submit-btn').textContent = 'Schedule Event';
  document.getElementById('new-event-overlay').style.display = 'flex';
  requestAnimationFrame(() => {
    document.getElementById('new-event-sheet').classList.add('sch-sheet-open');
  });
  setTimeout(() => document.getElementById('new-client-name').focus(), 300);
}

function closeNewEventSheet() {
  const sheet = document.getElementById('new-event-sheet');
  sheet.classList.remove('sch-sheet-open');
  setTimeout(() => { document.getElementById('new-event-overlay').style.display = 'none'; }, 280);
}

function clearNewEventForm() {
  ['new-client-name','new-client-email','new-client-phone','new-event-notes','sc-custom-amount','sc-custom-desc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('new-event-duration').value = '60';
  document.getElementById('new-event-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('new-event-time').value = '';
  document.getElementById('client-suggestions').style.display = 'none';
  document.getElementById('new-event-error').style.display = 'none';
  clearServiceCall();
  document.getElementById('notify-email').checked = true;
  document.getElementById('notify-sms').checked = true;
  _selectedServiceCall = null;
}

// ─── Service Call ──────────────────────────────────────────────────────────────
function selectServiceCall(btn, amount, desc) {
  // Deselect all preset buttons
  document.querySelectorAll('.sch-sc-btn').forEach(b => b.classList.remove('sch-sc-active'));
  btn.classList.add('sch-sc-active');
  _selectedServiceCall = { amount, description: desc };
  document.getElementById('sc-custom-row').style.display = 'none';
  showSCDisplay(amount, desc);
}

function toggleCustomSC() {
  const row = document.getElementById('sc-custom-row');
  const isHidden = row.style.display === 'none' || row.style.display === '';
  document.querySelectorAll('.sch-sc-btn').forEach(b => b.classList.remove('sch-sc-active'));
  if (isHidden) {
    row.style.display = '';
    document.querySelector('.sch-sc-custom-btn').classList.add('sch-sc-active');
    document.getElementById('sc-custom-amount').focus();
    _selectedServiceCall = null;
    hideSCDisplay();
  } else {
    row.style.display = 'none';
    _selectedServiceCall = null;
    hideSCDisplay();
  }
}

function onCustomSCInput() {
  const amount = parseFloat(document.getElementById('sc-custom-amount').value);
  const desc = document.getElementById('sc-custom-desc').value.trim() || 'Service Call';
  if (amount > 0) {
    _selectedServiceCall = { amount, description: desc };
    showSCDisplay(amount, desc);
  } else {
    _selectedServiceCall = null;
    hideSCDisplay();
  }
}

function showSCDisplay(amount, desc) {
  const el = document.getElementById('sc-selected-display');
  document.getElementById('sc-selected-text').textContent = `${desc} — $${Number(amount).toFixed(2)}`;
  el.style.display = 'flex'; // overrides the initial display:none
}

function hideSCDisplay() {
  document.getElementById('sc-selected-display').style.display = 'none';
}

function clearServiceCall() {
  _selectedServiceCall = null;
  document.querySelectorAll('.sch-sc-btn').forEach(b => b.classList.remove('sch-sc-active'));
  document.getElementById('sc-custom-row').style.display = 'none';
  hideSCDisplay();
}

// ─── Submit New Event ─────────────────────────────────────────────────────────
async function submitNewEvent(action) {
  const clientName = document.getElementById('new-client-name').value.trim();
  const clientEmail = document.getElementById('new-client-email').value.trim();
  const rawPhone = document.getElementById('new-client-phone').value.trim();
  const cc = (document.getElementById('new-cc')?.value || '+1').replace('-CA', '');
  const clientPhone = rawPhone ? cc + rawPhone.replace(/\D/g, '') : '';
  const date = document.getElementById('new-event-date').value;
  const time = document.getElementById('new-event-time').value;
  const durationMins = parseInt(document.getElementById('new-event-duration').value) || 60;
  const notes = document.getElementById('new-event-notes').value.trim();
  const notifyEmail = document.getElementById('notify-email').checked;
  const notifySms = document.getElementById('notify-sms').checked;
  const errEl = document.getElementById('new-event-error');
  errEl.style.display = 'none';

  if (!clientName) { showError(errEl, 'Client name is required.'); return; }
  if (!clientEmail) { showError(errEl, 'Client email is required.'); return; }
  if (!date || !time) { showError(errEl, 'Date and time are required.'); return; }

  const scheduledAt = new Date(`${date}T${time}`).toISOString();
  const btn = document.getElementById('new-event-submit-btn');
  btn.disabled = true; btn.textContent = 'Scheduling...';

  try {
    const res = await fetch('/api/create-scheduled-event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName, clientEmail, clientPhone, scheduledAt, durationMins,
        serviceCall: _selectedServiceCall || null,
        notes: notes || null,
        sendNotifications: notifyEmail || notifySms,
      }),
    });
    const data = await res.json();
    if (!res.ok) { showError(errEl, data.error || 'Failed to create event.'); return; }

    closeNewEventSheet();
    await loadEvents();

    if (action === 'invoice' || action === 'estimate') {
      const tab = action === 'invoice' ? 'new-invoice' : 'new-estimate';
      const params = new URLSearchParams({
        prefill: '1', tab,
        client_name: clientName,
        client_email: clientEmail,
        client_phone: rawPhone,
        event_id: data.id,
        ...(data.service_call?.amount ? {
          sc_amount: data.service_call.amount,
          sc_desc: data.service_call.description || 'Service Call',
        } : {}),
      });
      window.location.href = `manager.html?${params.toString()}`;
    }
  } catch (err) {
    showError(errEl, 'Network error. Please try again.');
  } finally {
    btn.disabled = false; btn.textContent = 'Schedule Event';
  }
}

// ─── Detail Sheet ─────────────────────────────────────────────────────────────
function openDetailSheet(eventId) {
  const evt = _events.find(e => e.id === eventId);
  if (!evt) return;
  _editingEventId = eventId;
  _isRescheduleMode = false;

  document.getElementById('detail-client-name').textContent = evt.client_name;
  renderDetailBody(evt);

  document.getElementById('detail-overlay').style.display = 'flex';
  requestAnimationFrame(() => {
    document.getElementById('detail-sheet').classList.add('sch-sheet-open');
  });
}

function closeDetailSheet() {
  const sheet = document.getElementById('detail-sheet');
  sheet.classList.remove('sch-sheet-open');
  setTimeout(() => { document.getElementById('detail-overlay').style.display = 'none'; }, 280);
}

function renderDetailBody(evt) {
  const dateStr = new Date(evt.scheduled_at).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const durLabel = evt.duration_mins >= 60
    ? (evt.duration_mins / 60) + ' hour' + (evt.duration_mins > 60 ? 's' : '')
    : evt.duration_mins + ' minutes';
  const scHtml = evt.service_call?.amount
    ? `<div class="sch-detail-row"><span>Service Call Fee</span><strong>$${Number(evt.service_call.amount).toFixed(2)}</strong></div>`
    : '';
  const notesHtml = evt.notes
    ? `<div class="sch-detail-notes">${esc(evt.notes)}</div>`
    : '';
  const statusBadge = evt.status === 'completed'
    ? `<span class="sch-status-done">Completed</span>`
    : `<span class="sch-status-sched">Scheduled</span>`;

  const rescheduleForm = `
    <div id="reschedule-form" style="display:none;margin-top:16px;padding:16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;">
      <div class="sch-section-label" style="margin-top:0;">New Date & Time</div>
      <div class="sch-date-time-row">
        <input type="date" id="reschedule-date" class="sch-input" style="flex:1.2;" value="${evt.scheduled_at.split('T')[0]}">
        <input type="time" id="reschedule-time" class="sch-input" style="flex:1;" value="${new Date(evt.scheduled_at).toTimeString().slice(0,5)}">
      </div>
      <select id="reschedule-duration" class="sch-input" style="margin-top:10px;">
        <option value="30" ${evt.duration_mins===30?'selected':''}>30 minutes</option>
        <option value="60" ${evt.duration_mins===60?'selected':''}>1 hour</option>
        <option value="90" ${evt.duration_mins===90?'selected':''}>1.5 hours</option>
        <option value="120" ${evt.duration_mins===120?'selected':''}>2 hours</option>
        <option value="180" ${evt.duration_mins===180?'selected':''}>3 hours</option>
        <option value="240" ${evt.duration_mins===240?'selected':''}>4 hours</option>
        <option value="480" ${evt.duration_mins===480?'selected':''}>All day (8 hrs)</option>
      </select>
      <label class="sch-check-label" style="margin-top:12px;">
        <input type="checkbox" id="reschedule-notify" checked>
        <span>Send reschedule email + SMS</span>
      </label>
      <div style="display:flex;gap:10px;margin-top:14px;">
        <button class="btn btn-primary" style="flex:1;" onclick="confirmReschedule()">Confirm Reschedule</button>
        <button class="btn btn-secondary" onclick="cancelReschedule()">Cancel</button>
      </div>
      <div id="reschedule-error" style="display:none;margin-top:8px;font-size:13px;color:#dc2626;"></div>
    </div>`;

  const invoiceUrl = `manager.html?prefill=1&tab=new-invoice&client_name=${encodeURIComponent(evt.client_name)}&client_email=${encodeURIComponent(evt.client_email)}&client_phone=${encodeURIComponent(evt.client_phone||'')}&event_id=${encodeURIComponent(evt.id)}${evt.service_call?.amount ? '&sc_amount='+evt.service_call.amount+'&sc_desc='+encodeURIComponent(evt.service_call.description||'Service Call') : ''}`;
  const estimateUrl = invoiceUrl.replace('tab=new-invoice','tab=new-estimate');

  document.getElementById('detail-sheet-body').innerHTML = `
    <div class="sch-detail-datetime">
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="flex-shrink:0;color:#6b7280;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
      <div>
        <div class="sch-detail-time">${esc(dateStr)}</div>
        <div class="sch-detail-dur">${esc(durLabel)}</div>
      </div>
      ${statusBadge}
    </div>

    <div class="sch-detail-contacts">
      ${evt.client_email ? `<a href="mailto:${esc(evt.client_email)}" class="sch-contact-chip">${esc(evt.client_email)}</a>` : ''}
      ${evt.client_phone ? `<a href="tel:${esc(evt.client_phone)}" class="sch-contact-chip">${esc(evt.client_phone)}</a>` : ''}
    </div>

    ${scHtml}
    ${notesHtml}

    ${rescheduleForm}

    <div class="sch-detail-actions" id="detail-main-actions">
      <button class="btn sch-detail-btn sch-detail-reschedule" onclick="showRescheduleForm()">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
        Reschedule
      </button>
      <a href="${invoiceUrl}" class="btn sch-detail-btn sch-detail-invoice">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2"/></svg>
        Invoice
      </a>
      <a href="${estimateUrl}" class="btn sch-detail-btn sch-detail-estimate">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
        Estimate
      </a>
      ${evt.status !== 'completed' ? `<button class="btn sch-detail-btn sch-detail-done" onclick="markEventDone('${evt.id}')">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
        Done
      </button>` : ''}
    </div>

    <button class="btn sch-detail-delete-btn" onclick="deleteEvent('${evt.id}')">
      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      Delete Event
    </button>`;
}

function showRescheduleForm() {
  document.getElementById('reschedule-form').style.display = '';
  document.getElementById('detail-main-actions').style.display = 'none';
}

function cancelReschedule() {
  document.getElementById('reschedule-form').style.display = 'none';
  document.getElementById('detail-main-actions').style.display = '';
}

async function confirmReschedule() {
  const date = document.getElementById('reschedule-date').value;
  const time = document.getElementById('reschedule-time').value;
  const durationMins = parseInt(document.getElementById('reschedule-duration').value) || 60;
  const notify = document.getElementById('reschedule-notify').checked;
  const errEl = document.getElementById('reschedule-error');
  errEl.style.display = 'none';

  if (!date || !time) { errEl.textContent = 'Date and time are required.'; errEl.style.display = ''; return; }

  const scheduledAt = new Date(`${date}T${time}`).toISOString();

  try {
    const res = await fetch('/api/update-scheduled-event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: _editingEventId, scheduledAt, durationMins, sendNotifications: notify }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Failed to reschedule.'; errEl.style.display = ''; return; }
    closeDetailSheet();
    await loadEvents();
  } catch {
    errEl.textContent = 'Network error.'; errEl.style.display = '';
  }
}

async function markEventDone(id) {
  try {
    await fetch('/api/update-scheduled-event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'completed', sendNotifications: false }),
    });
    closeDetailSheet();
    await loadEvents();
  } catch {}
}

async function deleteEvent(id) {
  if (!confirm('Delete this event? This cannot be undone.')) return;
  try {
    await fetch(`/api/delete-scheduled-event?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    closeDetailSheet();
    await loadEvents();
  } catch {}
}

// ─── Overlay click (close on backdrop) ───────────────────────────────────────
function overlayClick(e, overlayId) {
  if (e.target.id === overlayId) {
    if (overlayId === 'new-event-overlay') closeNewEventSheet();
    if (overlayId === 'detail-overlay') closeDetailSheet();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showError(el, msg) {
  el.textContent = msg;
  el.style.display = '';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Load business name for PIN screen
  fetch('/api/get-business-profile').then(r => r.ok ? r.json() : null).then(p => {
    if (p?.name) document.getElementById('pin-biz-name').textContent = p.name;
  }).catch(() => {});

  if (sessionStorage.getItem('mgr_auth') === '1') {
    initScheduler();
  } else {
    document.getElementById('pin-modal').style.display = '';
  }
});

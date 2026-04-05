// ─── Auth ─────────────────────────────────────────────────────────────────────

async function verifyPin(e) {
  e.preventDefault();
  const pin = document.getElementById('pin-input').value;
  const btn = document.getElementById('pin-btn');
  const errEl = document.getElementById('pin-error');
  btn.disabled = true; btn.textContent = 'Checking...';
  errEl.style.display = 'none';

  try {
    const res = await fetch('/api/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    if (data.ok) {
      sessionStorage.setItem('mgr_auth', '1');
      initManager();
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

function initManager() {
  document.getElementById('pin-modal').style.display = 'none';
  document.getElementById('manager-app').style.display = '';
  loadBusinessProfile();
  loadInvoices();
  loadClients();
  addItem();
  addEstimateItem();
}

// Check session on load
document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('mgr_auth') === '1') {
    initManager();
  }
  // Load biz name on PIN screen too
  fetch('/api/get-business-profile').then(r => r.json()).then(b => {
    const n = b.name || 'Invoice Pro';
    const el = document.getElementById('pin-biz-name');
    if (el) el.textContent = n;
  }).catch(() => {});
});

// ─── Tab switching ─────────────────────────────────────────────────────────────

function showTab(name, link) {
  document.querySelectorAll('.mgr-tab').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.mgr-nav-item').forEach(a => a.classList.remove('active'));
  document.getElementById(`tab-${name}`).style.display = '';
  if (link) link.classList.add('active');
  if (name === 'dashboard') loadInvoices();
  if (name === 'clients') loadClients();
  if (name === 'estimates') loadEstimates();
  if (name === 'settings') loadBusinessProfile();
}

// ─── Business profile ─────────────────────────────────────────────────────────

async function loadBusinessProfile() {
  try {
    const res = await fetch('/api/get-business-profile');
    const biz = await res.json();
    document.getElementById('biz-name').value = biz.name || '';
    document.getElementById('biz-tagline').value = biz.tagline || '';
    document.getElementById('biz-email').value = biz.email || '';
    document.getElementById('biz-phone').value = biz.phone || '';
    document.getElementById('biz-address').value = biz.address || '';
    document.getElementById('biz-city').value = biz.city || '';
    document.getElementById('biz-state').value = biz.state || '';
    document.getElementById('biz-zip').value = biz.zip || '';
    const name = biz.name || 'Invoice Pro';
    document.title = `Manager — ${name}`;
    const brandEl = document.getElementById('mgr-biz-name');
    if (brandEl) brandEl.textContent = name;
  } catch {}
}

async function saveBusinessProfile() {
  const fields = {
    name: document.getElementById('biz-name').value.trim(),
    tagline: document.getElementById('biz-tagline').value.trim(),
    email: document.getElementById('biz-email').value.trim(),
    phone: document.getElementById('biz-phone').value.trim(),
    address: document.getElementById('biz-address').value.trim(),
    city: document.getElementById('biz-city').value.trim(),
    state: document.getElementById('biz-state').value.trim(),
    zip: document.getElementById('biz-zip').value.trim(),
  };
  try {
    const res = await fetch('/api/save-business-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      const msgEl = document.getElementById('biz-saved-msg');
      msgEl.style.display = '';
      const brandEl = document.getElementById('mgr-biz-name');
      if (brandEl) brandEl.textContent = fields.name || 'Invoice Pro';
      setTimeout(() => { msgEl.style.display = 'none'; }, 3000);
    }
  } catch { showToast('Failed to save.', 'error'); }
}

// ─── Invoice list ──────────────────────────────────────────────────────────────

async function loadInvoices() {
  const loading = document.getElementById('dash-loading');
  const table = document.getElementById('invoice-table');
  const empty = document.getElementById('dash-empty');
  const tbody = document.getElementById('invoice-tbody');
  const filter = document.getElementById('status-filter')?.value || '';

  loading.style.display = ''; table.style.display = 'none'; empty.style.display = 'none';

  try {
    const res = await fetch('/api/get-invoices');
    let invoices = await res.json();
    if (filter) invoices = invoices.filter(i => i.status === filter);

    loading.style.display = 'none';
    if (!invoices.length) { empty.style.display = ''; return; }

    tbody.innerHTML = invoices.map(inv => `
      <tr>
        <td><div class="client-name">${esc(inv.client_name)}</div><div class="invoice-num">${esc(inv.client_email)}</div></td>
        <td>${esc(inv.invoice_number)}</td>
        <td><code style="font-size:13px;letter-spacing:0.1em;background:var(--gray-100);padding:2px 6px;border-radius:4px;">${esc(inv.passcode || '—')}</code></td>
        <td>${formatDate(inv.created_at)}</td>
        <td>${inv.due_date ? formatDate(inv.due_date) : '—'}</td>
        <td class="amount">$${Number(inv.total).toFixed(2)}</td>
        <td><span class="badge badge-${inv.status}">${capitalize(inv.status)}</span></td>
        <td>${inv.square_payment_link ? `<a href="${esc(inv.square_payment_link)}" target="_blank" class="btn btn-sm btn-secondary">Link</a>` : ''}</td>
      </tr>`).join('');
    table.style.display = '';
  } catch { loading.textContent = 'Failed to load invoices.'; }
}

// ─── Line items ────────────────────────────────────────────────────────────────

let itemId = 0;
const ITEM_TYPES = [
  { value: 'item',     label: 'Item / Product' },
  { value: 'hours',    label: 'Labor / Hours' },
  { value: 'service',  label: 'Service' },
  { value: 'material', label: 'Material' },
  { value: 'other',    label: 'Other' },
];

function addItem(desc = '', type = 'item', qty = 1, price = '') {
  const id = ++itemId;
  const typeOptions = ITEM_TYPES.map(t => `<option value="${t.value}"${t.value === type ? ' selected' : ''}>${t.label}</option>`).join('');
  const isHours = type === 'hours';
  const tr = document.createElement('tr');
  tr.id = `item-${id}`;
  tr.innerHTML = `
    <td>
      <select onchange="onTypeChange(${id},this)" style="width:100%;">
        ${typeOptions}
      </select>
    </td>
    <td><input type="text" placeholder="Description" value="${escAttr(desc)}" required oninput="recalcTotals()"></td>
    <td><input type="number" id="qty-${id}" value="${qty}" min="0.01" step="0.01" required oninput="recalcTotals()" style="width:70px;" title="${isHours ? 'Hours' : 'Quantity'}"></td>
    <td><input type="number" id="price-${id}" value="${price}" placeholder="0.00" min="0" step="0.01" required oninput="recalcTotals()" style="width:90px;" title="${isHours ? 'Hourly Rate' : 'Unit Price'}"></td>
    <td class="item-total-cell" id="item-total-${id}" style="text-align:right;">$0.00</td>
    <td><button type="button" class="remove-item-btn" onclick="removeItem(${id})">&#x2715;</button></td>
  `;
  document.getElementById('items-tbody').appendChild(tr);
  recalcTotals();
}

function onTypeChange(id, select) {
  const isHours = select.value === 'hours';
  const qtyInput = document.getElementById(`qty-${id}`);
  const priceInput = document.getElementById(`price-${id}`);
  if (qtyInput) qtyInput.title = isHours ? 'Hours' : 'Quantity';
  if (priceInput) priceInput.title = isHours ? 'Hourly Rate' : 'Unit Price';
  recalcTotals();
}

function removeItem(id) {
  document.getElementById(`item-${id}`)?.remove();
  recalcTotals();
}

function getItems() {
  return Array.from(document.getElementById('items-tbody').querySelectorAll('tr')).map(row => {
    const inputs = row.querySelectorAll('input[type=text],input[type=number]');
    const sel = row.querySelector('select');
    return {
      type: sel?.value || 'item',
      description: inputs[0]?.value.trim() || '',
      quantity: parseFloat(inputs[1]?.value) || 0,
      unitPrice: parseFloat(inputs[2]?.value) || 0,
    };
  });
}

function recalcTotals() {
  const items = getItems();
  const useTax = document.getElementById('tax-toggle')?.checked;
  const taxRate = useTax ? (parseFloat(document.getElementById('tax-rate')?.value) || 0) : 0;
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  // Per-row totals
  document.getElementById('items-tbody').querySelectorAll('tr').forEach((row, i) => {
    const cell = row.querySelector('.item-total-cell');
    if (cell && items[i]) cell.textContent = `$${(items[i].quantity * items[i].unitPrice).toFixed(2)}`;
  });

  document.getElementById('subtotal-display').textContent = `$${subtotal.toFixed(2)}`;
  document.getElementById('total-display').textContent = `$${total.toFixed(2)}`;
  const taxRow = document.getElementById('tax-row');
  if (taxRate > 0) {
    taxRow.style.display = '';
    document.getElementById('tax-label').textContent = `Tax (${taxRate}%)`;
    document.getElementById('tax-display').textContent = `$${taxAmount.toFixed(2)}`;
  } else {
    taxRow.style.display = 'none';
  }
}

function toggleTax() {
  const checked = document.getElementById('tax-toggle').checked;
  document.getElementById('tax-input-wrap').style.display = checked ? 'flex' : 'none';
  recalcTotals();
}

// ─── Submit invoice ────────────────────────────────────────────────────────────

async function submitInvoice(e) {
  e.preventDefault();
  const items = getItems();
  if (!items.length || items.some(i => !i.description || i.quantity <= 0)) {
    showToast('Please complete all line items.', 'error'); return;
  }

  const useTax = document.getElementById('tax-toggle').checked;
  const taxRate = useTax ? (parseFloat(document.getElementById('tax-rate').value) || 0) : 0;

  const payload = {
    clientName: document.getElementById('client-name').value.trim(),
    clientEmail: document.getElementById('client-email').value.trim(),
    clientPhone: document.getElementById('client-phone').value.trim(),
    clientCompany: document.getElementById('client-company').value.trim(),
    clientAddress: document.getElementById('client-address').value.trim(),
    items,
    taxRate,
    notes: document.getElementById('notes').value.trim(),
    dueDate: document.getElementById('due-date').value || null,
  };

  // Optionally save client
  if (document.getElementById('save-client-check').checked) {
    fetch('/api/save-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: payload.clientName, email: payload.clientEmail, phone: payload.clientPhone, company: payload.clientCompany, address: payload.clientAddress }),
    }).then(() => loadClients()).catch(() => {});
  }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Sending...';

  try {
    const res = await fetch('/api/create-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${data.error || 'Failed'}${data.detail ? ': ' + data.detail : ''}`);

    const successEl = document.getElementById('invoice-success');
    document.getElementById('success-detail').textContent =
      `${data.invoice_number} sent to ${payload.clientEmail}. Client passcode: ${data.passcode}`;
    successEl.style.display = '';
    resetInvoiceForm();
    setTimeout(() => { successEl.style.display = 'none'; }, 8000);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = 'Send Invoice & Payment Link';
  }
}

function resetInvoiceForm() {
  document.getElementById('invoice-form').reset();
  document.getElementById('items-tbody').innerHTML = '';
  itemId = 0;
  document.getElementById('tax-input-wrap').style.display = 'none';
  document.getElementById('tax-row').style.display = 'none';
  ['client-name','client-email','client-phone','client-company','client-address','notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  recalcTotals();
  addItem();
}

// ─── Clients ───────────────────────────────────────────────────────────────────

let clientsCache = [];

async function loadClients() {
  const loading = document.getElementById('clients-loading');
  const table = document.getElementById('clients-table');
  const empty = document.getElementById('clients-empty');
  const tbody = document.getElementById('clients-tbody');

  if (loading) loading.style.display = '';
  if (table) table.style.display = 'none';
  if (empty) empty.style.display = 'none';

  try {
    const res = await fetch('/api/get-clients');
    clientsCache = await res.json();

    // Populate client dropdowns
    const sel = document.getElementById('client-select');
    if (sel) {
      sel.innerHTML = '<option value="">— Select a saved client or fill in below —</option>' +
        clientsCache.map(c => `<option value="${c.id}">${esc(c.name)}${c.company ? ` (${esc(c.company)})` : ''}</option>`).join('');
    }
    populateEstimateClientDropdown();

    if (!loading) return;
    loading.style.display = 'none';
    if (!clientsCache.length) { if (empty) empty.style.display = ''; return; }

    if (tbody) tbody.innerHTML = clientsCache.map(c => `
      <tr>
        <td class="client-name">${esc(c.name)}</td>
        <td>${esc(c.email)}</td>
        <td>${esc(c.phone || '—')}</td>
        <td>${esc(c.company || '—')}</td>
        <td><code style="font-size:13px;letter-spacing:0.1em;background:var(--gray-100);padding:2px 6px;border-radius:4px;">${esc(c.passcode || '—')}</code></td>
        <td style="display:flex;gap:8px;">
          <button class="btn btn-sm btn-secondary" onclick="editClient('${c.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteClient('${c.id}')">Delete</button>
        </td>
      </tr>`).join('');
    if (table) table.style.display = '';
  } catch { if (loading) loading.textContent = 'Failed to load clients.'; }
}

function fillClient(id) {
  const c = clientsCache.find(x => x.id === id);
  if (!c) return;
  document.getElementById('client-name').value = c.name || '';
  document.getElementById('client-email').value = c.email || '';
  document.getElementById('client-phone').value = c.phone || '';
  document.getElementById('client-company').value = c.company || '';
  document.getElementById('client-address').value = c.address || '';
}

function showClientForm() {
  document.getElementById('client-form-wrap').style.display = '';
  document.getElementById('client-form-title').textContent = 'New Client';
  document.getElementById('edit-client-id').value = '';
  ['cf-name','cf-email','cf-phone','cf-company','cf-address','cf-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

function hideClientForm() {
  document.getElementById('client-form-wrap').style.display = 'none';
}

function editClient(id) {
  const c = clientsCache.find(x => x.id === id);
  if (!c) return;
  document.getElementById('client-form-wrap').style.display = '';
  document.getElementById('client-form-title').textContent = 'Edit Client';
  document.getElementById('edit-client-id').value = c.id;
  document.getElementById('cf-name').value = c.name || '';
  document.getElementById('cf-email').value = c.email || '';
  document.getElementById('cf-phone').value = c.phone || '';
  document.getElementById('cf-company').value = c.company || '';
  document.getElementById('cf-address').value = c.address || '';
  document.getElementById('cf-notes').value = c.notes || '';
}

async function saveClient() {
  const id = document.getElementById('edit-client-id').value;
  const payload = {
    id: id || undefined,
    name: document.getElementById('cf-name').value.trim(),
    email: document.getElementById('cf-email').value.trim(),
    phone: document.getElementById('cf-phone').value.trim(),
    company: document.getElementById('cf-company').value.trim(),
    address: document.getElementById('cf-address').value.trim(),
    notes: document.getElementById('cf-notes').value.trim(),
  };
  if (!payload.name || !payload.email) { showToast('Name and email are required.', 'error'); return; }
  try {
    const res = await fetch('/api/save-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to save');
    hideClientForm();
    await loadClients();
    showToast('Client saved!', 'success');
  } catch { showToast('Failed to save client.', 'error'); }
}

async function deleteClient(id) {
  if (!confirm('Delete this client?')) return;
  try {
    await fetch('/api/delete-client', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await loadClients();
  } catch { showToast('Failed to delete.', 'error'); }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

let toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 4000);
}

function esc(str) {
  const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML;
}
function escAttr(str) { return String(str || '').replace(/"/g, '&quot;'); }
function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ─── Estimates list ────────────────────────────────────────────────────────────

async function loadEstimates() {
  const loading = document.getElementById('est-loading');
  const table = document.getElementById('est-table');
  const empty = document.getElementById('est-empty');
  const tbody = document.getElementById('est-tbody');
  const filter = document.getElementById('est-status-filter')?.value || '';

  if (loading) loading.style.display = '';
  if (table) table.style.display = 'none';
  if (empty) empty.style.display = 'none';

  try {
    const url = filter ? `/api/get-estimates?status=${filter}` : '/api/get-estimates';
    const res = await fetch(url);
    const estimates = await res.json();

    if (loading) loading.style.display = 'none';
    if (!estimates.length) { if (empty) empty.style.display = ''; return; }

    if (tbody) tbody.innerHTML = estimates.map(est => {
      const completion = est.estimated_completion_date
        ? new Date(est.estimated_completion_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—';
      const statusColor = est.status === 'approved' ? 'paid' : est.status === 'rejected' ? 'rejected' : 'pending';
      return `<tr>
        <td><div class="client-name">${esc(est.client_name)}</div><div class="invoice-num">${esc(est.client_email)}</div></td>
        <td>${esc(est.estimate_number)}</td>
        <td>${formatDate(est.created_at)}</td>
        <td>${completion}</td>
        <td class="amount">$${Number(est.total).toFixed(2)}</td>
        <td><span class="badge badge-${statusColor}">${capitalize(est.status)}</span></td>
        <td id="msg-count-${est.id}"><span style="color:var(--gray-400);font-size:12px;">—</span></td>
        <td style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-secondary" onclick="openEstimateDetail('${est.id}')">View</button>
          ${est.status === 'approved' ? `<button class="btn btn-sm btn-primary" onclick="openEstimateDetail('${est.id}')" title="Convert to invoice" style="background:#0f766e;">Invoice →</button>` : ''}
        </td>
      </tr>`;
    }).join('');
    if (table) table.style.display = '';

    // Load message counts
    estimates.forEach(est => loadEstimateMsgCount(est.id));
  } catch { if (loading) loading.textContent = 'Failed to load estimates.'; }
}

async function loadEstimateMsgCount(estimateId) {
  try {
    const res = await fetch('/api/get-estimate-detail', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estimateId }),
    });
    const data = await res.json();
    const count = data.messages?.length || 0;
    const cell = document.getElementById(`msg-count-${estimateId}`);
    if (cell) cell.innerHTML = count > 0
      ? `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;">${count}</span>`
      : `<span style="color:var(--gray-400);font-size:12px;">0</span>`;
  } catch {}
}

// ─── Estimate detail + chat ────────────────────────────────────────────────────

let currentEstimateId = null;

async function openEstimateDetail(estimateId) {
  currentEstimateId = estimateId;
  const panel = document.getElementById('est-detail-panel');
  panel.style.display = '';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('est-chat-thread').innerHTML = '<div style="color:var(--gray-400);font-size:13px;">Loading...</div>';
  document.getElementById('est-detail-info').innerHTML = '';

  try {
    const res = await fetch('/api/get-estimate-detail', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estimateId }),
    });
    const est = await res.json();

    document.getElementById('est-detail-title').textContent = `${est.estimate_number} — ${est.client_name}`;
    const completion = est.estimated_completion_date
      ? new Date(est.estimated_completion_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : null;
    document.getElementById('est-detail-info').innerHTML = `
      <span class="badge badge-${est.status === 'approved' ? 'paid' : est.status === 'rejected' ? 'rejected' : 'pending'}" style="margin-right:10px;">${capitalize(est.status)}</span>
      <strong>$${Number(est.total).toFixed(2)}</strong>
      ${completion ? ` &nbsp;·&nbsp; Est. completion: <strong>${completion}</strong>` : ''}
      &nbsp;·&nbsp; ${esc(est.client_email)}
    `;

    renderEstimateChat(est.messages || []);

    // Show convert-to-invoice section for approved estimates
    if (est.status === 'approved') {
      showConvertToInvoice(est);
    } else {
      const section = document.getElementById('convert-invoice-section');
      if (section) section.style.display = 'none';
    }
  } catch {
    document.getElementById('est-chat-thread').innerHTML = '<div style="color:red;">Failed to load.</div>';
  }
}

function renderEstimateChat(messages) {
  const thread = document.getElementById('est-chat-thread');
  if (!messages.length) {
    thread.innerHTML = '<div style="color:var(--gray-400);font-size:13px;font-style:italic;">No messages yet.</div>';
    return;
  }
  thread.innerHTML = messages.map(m => {
    const isManager = m.sender === 'manager';
    const time = new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return `<div class="chat-bubble ${isManager ? 'chat-bubble-manager' : 'chat-bubble-client'}">
      <div class="chat-bubble-meta">${isManager ? 'You' : 'Client'} · ${time}</div>
      <div class="chat-bubble-text">${esc(m.message)}</div>
    </div>`;
  }).join('');
}

function closeEstimateDetail() {
  document.getElementById('est-detail-panel').style.display = 'none';
  currentEstimateId = null;
  currentEstimateData = null;
}

// ─── Convert estimate → invoice ────────────────────────────────────────────────

let currentEstimateData = null;

function showConvertToInvoice(estimate) {
  currentEstimateData = estimate;
  const section = document.getElementById('convert-invoice-section');
  const list = document.getElementById('convert-items-list');
  const successEl = document.getElementById('convert-success');
  if (!section || !list) return;

  successEl.style.display = 'none';
  section.style.display = '';

  list.innerHTML = (estimate.items || []).map((item, i) => `
    <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:6px;cursor:pointer;">
      <input type="checkbox" class="convert-item-check" data-index="${i}" data-cost="${item.cost || 0}"
        onchange="recalcConvertTotal()" checked style="margin-top:3px;flex-shrink:0;">
      <div style="flex:1;">
        <div style="font-size:14px;font-weight:600;color:var(--gray-800);">${esc(item.description)}</div>
        ${item.explanation ? `<div style="font-size:12px;color:var(--gray-500);margin-top:2px;">${esc(item.explanation)}</div>` : ''}
      </div>
      <div style="font-size:14px;font-weight:700;color:var(--gray-800);white-space:nowrap;">$${Number(item.cost || 0).toFixed(2)}</div>
    </label>`).join('');

  recalcConvertTotal();
}

function toggleConvertSection() {
  const section = document.getElementById('convert-invoice-section');
  if (section) section.style.display = section.style.display === 'none' ? '' : 'none';
}

function selectAllConvertItems(checked) {
  document.querySelectorAll('.convert-item-check').forEach(cb => { cb.checked = checked; });
  recalcConvertTotal();
}

function recalcConvertTotal() {
  let total = 0;
  document.querySelectorAll('.convert-item-check:checked').forEach(cb => {
    total += parseFloat(cb.dataset.cost) || 0;
  });
  const totalEl = document.getElementById('convert-total');
  if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;
}

async function submitConvertToInvoice() {
  if (!currentEstimateData) return;

  const selectedIndices = [];
  document.querySelectorAll('.convert-item-check:checked').forEach(cb => {
    selectedIndices.push(parseInt(cb.dataset.index));
  });

  if (!selectedIndices.length) { showToast('Select at least one item.', 'error'); return; }

  const allItems = currentEstimateData.items || [];
  const invoiceItems = selectedIndices.map(i => ({
    type: allItems[i].type || 'item',
    description: allItems[i].description,
    quantity: 1,
    unitPrice: Number(allItems[i].cost) || 0,
  }));

  const payload = {
    clientName: currentEstimateData.client_name,
    clientEmail: currentEstimateData.client_email,
    items: invoiceItems,
    taxRate: currentEstimateData.tax_rate || 0,
    notes: `Converted from estimate ${currentEstimateData.estimate_number}`,
  };

  const btn = document.getElementById('convert-send-btn');
  btn.disabled = true; btn.textContent = 'Sending...';

  try {
    const res = await fetch('/api/create-invoice', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${data.error || 'Failed'}${data.detail ? ': ' + data.detail : ''}`);

    const successEl = document.getElementById('convert-success');
    successEl.textContent = `Invoice ${data.invoice_number} sent to ${currentEstimateData.client_email}! Passcode: ${data.passcode}`;
    successEl.style.display = '';
    showToast('Invoice sent!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Send Invoice';
  }
}

async function sendEstimateReply() {
  if (!currentEstimateId) return;
  const input = document.getElementById('est-reply-input');
  const message = input.value.trim();
  if (!message) return;

  const btn = document.querySelector('#est-detail-panel .btn-primary');
  btn.disabled = true; btn.textContent = 'Sending...';

  try {
    const res = await fetch('/api/estimate-reply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estimateId: currentEstimateId, message }),
    });
    if (!res.ok) throw new Error('Failed to send');
    input.value = '';
    showToast('Reply sent — client notified by email.', 'success');
    await openEstimateDetail(currentEstimateId); // refresh chat
  } catch {
    showToast('Failed to send reply.', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Send Reply';
  }
}

// ─── New Estimate form ────────────────────────────────────────────────────────

let estItemId = 0;
const EST_TYPES = [
  { value: 'item', label: 'Item / Product' },
  { value: 'labor', label: 'Labor / Hours' },
  { value: 'service', label: 'Service' },
  { value: 'material', label: 'Material' },
  { value: 'other', label: 'Other' },
];

function addEstimateItem(desc = '', explanation = '', type = 'item', cost = '', days = '') {
  const id = ++estItemId;
  const typeOptions = EST_TYPES.map(t => `<option value="${t.value}"${t.value === type ? ' selected' : ''}>${t.label}</option>`).join('');
  const tr = document.createElement('tr');
  tr.id = `est-item-${id}`;
  tr.innerHTML = `
    <td><select style="width:100%;">${typeOptions}</select></td>
    <td>
      <input type="text" placeholder="Description" value="${escAttr(desc)}" required oninput="recalcEstimateTotals()" style="width:100%;margin-bottom:4px;">
      <textarea id="est-expl-${id}" placeholder="Explain why (optional)..." style="width:100%;min-height:44px;font-size:12px;resize:vertical;">${escAttr(explanation)}</textarea>
    </td>
    <td><input type="number" id="est-cost-${id}" value="${escAttr(cost)}" placeholder="0.00" min="0" step="0.01" required oninput="recalcEstimateTotals()" style="width:90px;"></td>
    <td>
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;">
        <input type="checkbox" id="est-days-toggle-${id}" onchange="toggleEstimateDays(${id},this)"${days ? ' checked' : ''}> Days
      </label>
      <input type="number" id="est-days-${id}" value="${escAttr(days)}" placeholder="0" min="1" step="1" oninput="recalcEstimateTotals()" style="width:70px;margin-top:4px;${days ? '' : 'display:none;'}">
    </td>
    <td><button type="button" class="remove-item-btn" onclick="removeEstimateItem(${id})">&#x2715;</button></td>
  `;
  document.getElementById('est-items-tbody').appendChild(tr);
  recalcEstimateTotals();
}

function toggleEstimateDays(id, checkbox) {
  const input = document.getElementById(`est-days-${id}`);
  if (input) { input.style.display = checkbox.checked ? '' : 'none'; if (!checkbox.checked) input.value = ''; }
  recalcEstimateTotals();
}

function removeEstimateItem(id) {
  document.getElementById(`est-item-${id}`)?.remove();
  recalcEstimateTotals();
}

function getEstimateItems() {
  return Array.from(document.getElementById('est-items-tbody').querySelectorAll('tr')).map(row => {
    const sel = row.querySelector('select');
    const inputs = row.querySelectorAll('input[type=text], textarea');
    const costInput = row.querySelector('input[type=number][placeholder="0.00"]');
    const daysToggle = row.querySelector('input[type=checkbox]');
    const daysInput = row.querySelector('input[type=number][placeholder="0"]');
    return {
      type: sel?.value || 'item',
      description: inputs[0]?.value.trim() || '',
      explanation: inputs[1]?.value.trim() || '',
      cost: parseFloat(costInput?.value) || 0,
      estimatedDays: daysToggle?.checked ? (parseInt(daysInput?.value) || 0) : 0,
    };
  });
}

function recalcEstimateTotals() {
  const items = getEstimateItems();
  const useTax = document.getElementById('est-tax-toggle')?.checked;
  const taxRate = useTax ? (parseFloat(document.getElementById('est-tax-rate')?.value) || 0) : 0;
  const subtotal = items.reduce((s, i) => s + i.cost, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  const totalDays = items.reduce((s, i) => s + (i.estimatedDays || 0), 0);

  document.getElementById('est-subtotal-display').textContent = `$${subtotal.toFixed(2)}`;
  document.getElementById('est-total-display').textContent = `$${total.toFixed(2)}`;

  const taxRow = document.getElementById('est-tax-row');
  if (taxRate > 0) {
    taxRow.style.display = '';
    document.getElementById('est-tax-label').textContent = `Tax (${taxRate}%)`;
    document.getElementById('est-tax-display').textContent = `$${taxAmount.toFixed(2)}`;
  } else {
    taxRow.style.display = 'none';
  }

  const completionWrap = document.getElementById('est-completion-display');
  if (totalDays > 0) {
    const d = new Date(); d.setDate(d.getDate() + totalDays);
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    document.getElementById('est-completion-date').textContent = dateStr;
    completionWrap.style.display = '';
  } else {
    completionWrap.style.display = 'none';
  }
}

function toggleEstimateTax() {
  const checked = document.getElementById('est-tax-toggle').checked;
  document.getElementById('est-tax-input-wrap').style.display = checked ? 'flex' : 'none';
  recalcEstimateTotals();
}

function fillEstimateClient(id) {
  const c = clientsCache.find(x => x.id === id);
  if (!c) return;
  document.getElementById('est-client-name').value = c.name || '';
  document.getElementById('est-client-email').value = c.email || '';
}

async function submitEstimate(e) {
  e.preventDefault();
  const items = getEstimateItems();
  if (!items.length || items.some(i => !i.description || i.cost < 0)) {
    showToast('Please complete all estimate items.', 'error'); return;
  }

  const useTax = document.getElementById('est-tax-toggle').checked;
  const taxRate = useTax ? (parseFloat(document.getElementById('est-tax-rate').value) || 0) : 0;

  const payload = {
    clientName: document.getElementById('est-client-name').value.trim(),
    clientEmail: document.getElementById('est-client-email').value.trim(),
    items,
    taxRate,
    notes: document.getElementById('est-notes').value.trim(),
  };

  const btn = document.getElementById('est-submit-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Sending...';

  try {
    const res = await fetch('/api/create-estimate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${data.error || 'Failed'}${data.detail ? ': ' + data.detail : ''}`);

    const successEl = document.getElementById('est-success');
    document.getElementById('est-success-detail').textContent =
      `${data.estimate_number} sent to ${payload.clientEmail}. Client access code: ${data.passcode}`;
    successEl.style.display = '';
    resetEstimateForm();
    setTimeout(() => { successEl.style.display = 'none'; }, 8000);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = 'Send Estimate';
  }
}

function resetEstimateForm() {
  document.getElementById('estimate-form').reset();
  document.getElementById('est-items-tbody').innerHTML = '';
  estItemId = 0;
  document.getElementById('est-tax-input-wrap').style.display = 'none';
  document.getElementById('est-tax-row').style.display = 'none';
  document.getElementById('est-completion-display').style.display = 'none';
  recalcEstimateTotals();
  addEstimateItem();
}

// Populate estimate client dropdown from existing clientsCache
function populateEstimateClientDropdown() {
  const sel = document.getElementById('est-client-select');
  if (!sel || !clientsCache.length) return;
  sel.innerHTML = '<option value="">— Select a saved client or fill in below —</option>' +
    clientsCache.map(c => `<option value="${c.id}">${esc(c.name)}${c.company ? ` (${esc(c.company)})` : ''}</option>`).join('');
}

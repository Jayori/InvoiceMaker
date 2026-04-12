// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPhone(ccId, phoneId) {
  const raw = document.getElementById(phoneId).value.trim();
  if (!raw) return '';
  const cc = (document.getElementById(ccId)?.value || '+1').replace('-CA', ''); // +1-CA → +1
  const digits = raw.replace(/\D/g, '');
  return cc + digits;
}

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

let businessProfilesCache = [];

function initManager() {
  document.getElementById('pin-modal').style.display = 'none';
  document.getElementById('manager-app').style.display = '';
  loadBusinessProfiles();
  loadInvoices();
  loadEstimates();
  loadClients();
}

// Check session on load
document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('mgr_auth') === '1') {
    initManager();
  }
});

// ─── Tab switching ─────────────────────────────────────────────────────────────

function showTab(name, link) {
  document.querySelectorAll('.mgr-tab').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.mgr-nav-item, .mobile-nav-item').forEach(a => a.classList.remove('active'));
  document.getElementById(`tab-${name}`).style.display = '';
  if (link) link.classList.add('active');
  // Sync the other nav (desktop ↔ mobile)
  const allNav = document.querySelectorAll('.mgr-nav-item, .mobile-nav-item');
  allNav.forEach(a => { if (a.getAttribute('onclick')?.includes(`'${name}'`)) a.classList.add('active'); });
  if (name === 'dashboard') { loadInvoices(); loadEstimates(); }
  if (name === 'clients') loadClients();
  if (name === 'settings') loadBusinessProfiles();
}

// ─── Business profiles ────────────────────────────────────────────────────────

async function loadBusinessProfiles() {
  try {
    const res = await fetch('/api/get-business-profiles');
    const profiles = await res.json();
    businessProfilesCache = Array.isArray(profiles) ? profiles : [];
    renderBusinessProfilesList();
    populateBusinessDropdowns();
  } catch {}
}

function populateBusinessDropdowns() {
  const opts = businessProfilesCache.map(p =>
    `<option value="${p.id}">${p.nickname || p.name}</option>`
  ).join('');
  ['inv-business-select', 'est-business-select'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const current = el.value;
    el.innerHTML = '<option value="">— Select a business profile —</option>' + opts;
    if (current) el.value = current;
  });
}

function renderBusinessProfilesList() {
  const container = document.getElementById('biz-profiles-list');
  if (!container) return;
  if (!businessProfilesCache.length) {
    container.innerHTML = '<p style="color:var(--gray-500);font-size:14px;">No profiles yet. Add one below.</p>';
    return;
  }
  container.innerHTML = businessProfilesCache.map(p => `
    <div class="card" style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;">
      <div>
        <div style="font-weight:600;font-size:15px;color:var(--gray-900);">${escHtmlJs(p.nickname || p.name)}</div>
        <div style="font-size:13px;color:var(--gray-500);margin-top:2px;">${escHtmlJs(p.name)}${p.email ? ' · ' + escHtmlJs(p.email) : ''}${p.phone ? ' · ' + escHtmlJs(p.phone) : ''}</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="editBizProfile('${p.id}')">Edit</button>
        <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:none;" onclick="deleteBizProfile('${p.id}')">Delete</button>
      </div>
    </div>`).join('');
}

function editBizProfile(id) {
  const p = businessProfilesCache.find(x => x.id === id);
  if (!p) return;
  document.getElementById('biz-edit-id').value = p.id;
  document.getElementById('biz-nickname').value = p.nickname || '';
  document.getElementById('biz-name').value = p.name || '';
  document.getElementById('biz-tagline').value = p.tagline || '';
  document.getElementById('biz-email').value = p.email || '';
  document.getElementById('biz-phone').value = p.phone || '';
  document.getElementById('biz-address').value = p.address || '';
  document.getElementById('biz-city').value = p.city || '';
  document.getElementById('biz-state').value = p.state || '';
  document.getElementById('biz-zip').value = p.zip || '';
  document.getElementById('biz-form-title').textContent = 'Edit Business Profile';
  document.getElementById('biz-cancel-btn').style.display = '';
  document.getElementById('biz-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditBizProfile() {
  document.getElementById('biz-edit-id').value = '';
  ['biz-nickname','biz-name','biz-tagline','biz-email','biz-phone','biz-address','biz-city','biz-state','biz-zip'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('biz-form-title').textContent = 'Add New Business Profile';
  document.getElementById('biz-cancel-btn').style.display = 'none';
}

async function saveBusinessProfile() {
  const nickname = document.getElementById('biz-nickname').value.trim();
  const name = document.getElementById('biz-name').value.trim();
  if (!nickname || !name) { showToast('Nickname and Business Name are required.', 'error'); return; }
  const id = document.getElementById('biz-edit-id').value;
  const fields = {
    id: id || undefined,
    nickname,
    name,
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
      setTimeout(() => { msgEl.style.display = 'none'; }, 3000);
      cancelEditBizProfile();
      loadBusinessProfiles();
    } else { showToast('Failed to save.', 'error'); }
  } catch { showToast('Failed to save.', 'error'); }
}

async function deleteBizProfile(id) {
  if (!confirm('Delete this business profile?')) return;
  try {
    const res = await fetch('/api/delete-business-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) loadBusinessProfiles();
    else showToast('Failed to delete.', 'error');
  } catch { showToast('Failed to delete.', 'error'); }
}

function escHtmlJs(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Invoice list ──────────────────────────────────────────────────────────────

let invoicesCache = [];

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
    invoicesCache = invoices;
    if (filter) invoices = invoices.filter(i => i.status === filter);

    loading.style.display = 'none';
    if (!invoices.length) { empty.style.display = ''; return; }

    tbody.innerHTML = invoices.map(inv => `
      <tr onclick="previewInvoice('${inv.id}')" style="cursor:pointer;" title="Click to preview">
        <td><div class="client-name">${esc(inv.client_name)}</div><div class="invoice-num">${esc(inv.client_email)}</div></td>
        <td>${esc(inv.invoice_number)}</td>
        <td onclick="event.stopPropagation()"><code style="cursor:pointer;font-size:13px;letter-spacing:0.1em;background:var(--gray-100);padding:2px 6px;border-radius:4px;" onclick="copyPasscode('${escAttr(inv.passcode||'')}',this)" title="Click to copy">${esc(inv.passcode || '—')}</code></td>
        <td>${formatDate(inv.created_at)}</td>
        <td>${inv.due_date ? formatDate(inv.due_date) : '—'}</td>
        <td class="amount">$${Number(inv.total).toFixed(2)}</td>
        <td><span class="badge badge-${inv.status}">${capitalize(inv.status)}</span></td>
        <td onclick="event.stopPropagation()" style="white-space:nowrap;">
          <div style="display:flex;gap:6px;flex-wrap:nowrap;align-items:center;">
            ${inv.square_payment_link && inv.status !== 'paid' ? `<button class="btn btn-sm btn-secondary" onclick="copyPaymentLink('${escAttr(inv.square_payment_link)}')" title="Copy payment link">Copy Link</button>` : ''}
            ${inv.status !== 'paid' ? `<button class="btn btn-sm" style="background:#dcfce7;color:#166534;border:none;" onclick="markInvoicePaidFromRow('${inv.id}')">Mark Paid</button>` : ''}
            <button class="btn btn-sm btn-secondary" onclick="editInvoice('${inv.id}')">Edit</button>
            <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:none;" onclick="deleteInvoice('${inv.id}')">Delete</button>
            ${!clientsCache.some(c => c.email?.toLowerCase() === inv.client_email?.toLowerCase()) ? `<button class="btn btn-sm btn-secondary" onclick="saveClientFromRow('${escAttr(inv.client_name)}','${escAttr(inv.client_email)}','${escAttr(inv.client_phone||'')}','${escAttr(inv.client_company||'')}','${escAttr(inv.client_address||'')}','${escAttr(inv.client_city||'')}','${escAttr(inv.client_state||'')}','${escAttr(inv.client_zip||'')}')" title="Save client to contacts">+ Client</button>` : ''}
          </div>
        </td>
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

function addItem(desc = '', type = 'item', qty = 1, price = '', discount = '', workDate = '') {
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
    <td>
      <input type="text" id="desc-${id}" placeholder="Description" value="${escAttr(desc)}" required oninput="recalcTotals()" style="width:100%;margin-bottom:3px;">
      <input type="date" id="workdate-${id}" value="${escAttr(workDate)}" title="Work date (optional)" style="width:100%;font-size:11px;padding:3px 6px;border:1px solid var(--gray-200);border-radius:4px;color:var(--gray-500);">
    </td>
    <td><input type="number" id="qty-${id}" value="${qty}" min="0.01" step="0.01" required oninput="recalcTotals()" style="width:60px;" title="${isHours ? 'Hours' : 'Quantity'}"></td>
    <td><input type="number" id="price-${id}" value="${price}" placeholder="0.00" min="0" step="0.01" required oninput="recalcTotals()" style="width:80px;" title="${isHours ? 'Hourly Rate' : 'Unit Price'}"></td>
    <td><input type="number" id="discount-${id}" value="${discount}" placeholder="0.00" min="0" step="0.01" oninput="recalcTotals()" style="width:80px;" title="Discount amount (optional)"></td>
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
    const id = row.id.replace('item-', '');
    const sel = row.querySelector('select');
    const workDate = document.getElementById(`workdate-${id}`)?.value || null;
    const discount = parseFloat(document.getElementById(`discount-${id}`)?.value) || 0;
    const qty = parseFloat(document.getElementById(`qty-${id}`)?.value) || 0;
    const unitPrice = parseFloat(document.getElementById(`price-${id}`)?.value) || 0;
    return {
      type: sel?.value || 'item',
      description: document.getElementById(`desc-${id}`)?.value.trim() || '',
      workDate: workDate || null,
      quantity: qty,
      unitPrice,
      discount,
    };
  });
}

function recalcTotals() {
  const items = getItems();
  const useTax = document.getElementById('tax-toggle')?.checked;
  const taxRate = useTax ? (parseFloat(document.getElementById('tax-rate')?.value) || 0) : 0;
  const subtotal = items.reduce((s, i) => {
    const lineTotal = i.quantity * i.unitPrice;
    const disc = Math.min(i.discount || 0, lineTotal);
    return s + lineTotal - disc;
  }, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  // Per-row totals
  document.getElementById('items-tbody').querySelectorAll('tr').forEach((row, i) => {
    const cell = row.querySelector('.item-total-cell');
    if (cell && items[i]) {
      const lineTotal = items[i].quantity * items[i].unitPrice;
      const disc = Math.min(items[i].discount || 0, lineTotal);
      cell.textContent = `$${(lineTotal - disc).toFixed(2)}`;
    }
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

  const receiptPhotos = await collectPhotos('invoice-photos');

  const payload = {
    clientName: document.getElementById('client-name').value.trim(),
    clientEmail: document.getElementById('client-email').value.trim(),
    businessProfileId: document.getElementById('inv-business-select').value || null,
    clientPhone: buildPhone('client-phone-cc', 'client-phone'),
    clientCompany: document.getElementById('client-company').value.trim(),
    clientAddress: document.getElementById('client-address').value.trim(),
    clientCity: document.getElementById('client-city').value.trim(),
    clientState: document.getElementById('client-state').value.trim(),
    clientZip: document.getElementById('client-zip').value.trim(),
    items,
    taxRate,
    notes: document.getElementById('notes').value.trim(),
    dueDate: document.getElementById('due-date').value || null,
    sendEmail: document.getElementById('inv-send-email').checked,
    sendSmsNotification: document.getElementById('inv-send-sms').checked,
    receiptPhotos,
  };

  // Optionally save client
  if (document.getElementById('save-client-check').checked) {
    fetch('/api/save-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: payload.clientName, email: payload.clientEmail, phone: payload.clientPhone, company: payload.clientCompany, address: payload.clientAddress, city: payload.clientCity, state: payload.clientState, zip: payload.clientZip }),
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

    resetInvoiceForm();
    loadInvoices();
    showTab('dashboard');
    showToast('Invoice Sent!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = 'Send Invoice & Payment Link';
  }
}

function resetInvoiceForm() {
  currentEditInvoiceId = null;
  document.getElementById('invoice-form').reset();
  document.getElementById('items-tbody').innerHTML = '';
  itemId = 0;
  document.getElementById('tax-input-wrap').style.display = 'none';
  document.getElementById('tax-row').style.display = 'none';
  const photoPreview = document.getElementById('invoice-photo-preview');
  if (photoPreview) photoPreview.innerHTML = '';
  ['client-name','client-email','client-phone','client-company','client-address','client-city','client-state','client-zip','notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  recalcTotals();
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
        <td style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-secondary" onclick="editClient('${c.id}')">Edit</button>
          <button class="btn btn-sm btn-secondary" onclick="regenClientCode('${c.id}', '${escAttr(c.name)}')">New Code</button>
          <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:none;" onclick="deleteClient('${c.id}')">Delete</button>
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
  document.getElementById('client-city').value = c.city || '';
  document.getElementById('client-state').value = c.state || '';
  document.getElementById('client-zip').value = c.zip || '';
}

function showClientForm() {
  document.getElementById('client-form-wrap').style.display = '';
  document.getElementById('client-form-title').textContent = 'New Client';
  document.getElementById('edit-client-id').value = '';
  ['cf-name','cf-email','cf-phone','cf-company','cf-address','cf-city','cf-state','cf-zip','cf-notes'].forEach(id => {
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
  document.getElementById('cf-city').value = c.city || '';
  document.getElementById('cf-state').value = c.state || '';
  document.getElementById('cf-zip').value = c.zip || '';
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
    city: document.getElementById('cf-city').value.trim(),
    state: document.getElementById('cf-state').value.trim(),
    zip: document.getElementById('cf-zip').value.trim(),
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
  if (!confirm('Delete this client? This cannot be undone.')) return;
  try {
    await fetch('/api/delete-client', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await loadClients();
    showToast('Client deleted.', 'success');
  } catch { showToast('Failed to delete.', 'error'); }
}

async function regenClientCode(id, name) {
  if (!confirm(`Generate a new access code for ${name}? Their old code will stop working.`)) return;
  try {
    const res = await fetch('/api/regen-client-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    await loadClients();
    showToast(`New code for ${name}: ${data.passcode}`, 'success');
  } catch { showToast('Failed to regenerate code.', 'error'); }
}

// ─── Photo Lightbox ────────────────────────────────────────────────────────────

let _lbPhotos = [], _lbIdx = 0;

function openPhotoLightbox(photos, index) {
  _lbPhotos = Array.isArray(photos) ? photos : [photos];
  _lbIdx = index || 0;
  _renderLightbox();
  document.getElementById('photo-lightbox').classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

function _renderLightbox() {
  document.getElementById('lightbox-img').src = _lbPhotos[_lbIdx];
  const multi = _lbPhotos.length > 1;
  document.getElementById('lightbox-prev').style.display = multi ? '' : 'none';
  document.getElementById('lightbox-next').style.display = multi ? '' : 'none';
  const counter = document.getElementById('lightbox-counter');
  counter.textContent = multi ? `${_lbIdx + 1} / ${_lbPhotos.length}` : '';
  counter.style.display = multi ? '' : 'none';
}

function lightboxNav(dir) {
  _lbIdx = (_lbIdx + dir + _lbPhotos.length) % _lbPhotos.length;
  _renderLightbox();
}

function closeLightbox() {
  document.getElementById('photo-lightbox').classList.remove('is-open');
  document.getElementById('lightbox-img').src = '';
  document.body.style.overflow = '';
}

function handleLightboxClick(e) {
  if (e.target === document.getElementById('photo-lightbox')) closeLightbox();
}

document.addEventListener('keydown', e => {
  const lb = document.getElementById('photo-lightbox');
  if (!lb?.classList.contains('is-open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') lightboxNav(-1);
  if (e.key === 'ArrowRight') lightboxNav(1);
});

// ─── Invoice Preview Modal ─────────────────────────────────────────────────────

function previewInvoice(id) {
  const inv = invoicesCache.find(i => i.id === id);
  if (!inv) { showToast('Invoice not found.', 'error'); return; }

  // Resolve business name
  const biz = businessProfilesCache.find(p => p.id === inv.business_profile_id);
  const bizName = biz?.name || 'InvoiceMePro';

  // Status badge
  const isPaid = inv.status === 'paid';
  const statusHtml = isPaid
    ? `<span class="inv-status-badge inv-status-paid">Paid</span>`
    : `<span class="inv-status-badge inv-status-pending">Payment Due</span>`;

  // Due date
  const dueStr = inv.due_date
    ? new Date(inv.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Upon receipt';

  // Line items
  function buildRow(item) {
    const lineTotal = item.quantity * item.unitPrice;
    const disc = Math.min(Number(item.discount) || 0, lineTotal);
    const net = lineTotal - disc;
    const qtyLabel = item.type === 'hours' ? `${item.quantity} hrs` : `×${item.quantity}`;
    const rateHtml = disc > 0
      ? `<span class="item-original-amt">$${Number(item.unitPrice).toFixed(2)}</span>`
      : `$${Number(item.unitPrice).toFixed(2)}`;
    const discRow = disc > 0
      ? `<tr><td colspan="3" style="padding:1px 0 6px;font-size:12px;"><span class="item-discount-credit">✓ Courtesy discount: -$${disc.toFixed(2)}</span></td><td></td></tr>`
      : '';
    return `<tr>
      <td>${esc(item.description)}${item.type === 'hours' ? ' <span class="item-type-tag">hourly</span>' : ''}</td>
      <td style="text-align:center;color:var(--gray-500);">${qtyLabel}</td>
      <td style="text-align:right;">${rateHtml}</td>
      <td style="text-align:right;font-weight:500;">$${net.toFixed(2)}</td>
    </tr>${discRow}`;
  }

  const items = inv.items || [];
  const dated = {}, undated = [];
  items.forEach(item => {
    if (item.workDate) {
      if (!dated[item.workDate]) dated[item.workDate] = [];
      dated[item.workDate].push(item);
    } else { undated.push(item); }
  });
  let rowsHtml = undated.map(buildRow).join('');
  Object.keys(dated).sort().forEach(date => {
    const ds = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
    rowsHtml += `<tr><td colspan="4"><div class="work-date-header">${esc(ds)}</div></td></tr>`;
    rowsHtml += dated[date].map(buildRow).join('');
  });

  // Totals
  const taxRow = inv.tax_rate > 0
    ? `<div class="inv-totals-row"><span>Tax (${inv.tax_rate}%)</span><span>$${Number(inv.tax_amount).toFixed(2)}</span></div>`
    : '';

  // Notes
  const notesHtml = inv.notes
    ? `<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--gray-100);">
        <div class="inv-label">Notes</div>
        <div class="inv-notes-text">${esc(inv.notes)}</div>
       </div>`
    : '';

  // Photos
  const photos = inv.receipt_photos || [];
  window._previewPhotos = photos;
  const photosHtml = photos.length
    ? `<div style="margin-top:16px;"><div class="inv-label" style="margin-bottom:8px;">Photos</div>
       <div class="receipt-photos-wrap">${photos.map((p, i) => `<img src="${esc(p)}" class="receipt-thumb" onclick="openPhotoLightbox(window._previewPhotos,${i})">`).join('')}</div></div>`
    : '';

  document.getElementById('inv-preview-body').innerHTML = `
    <div class="inv-preview-bizname">${esc(bizName)}</div>
    <div class="inv-header">
      <div>
        <div class="inv-number">${esc(inv.invoice_number)}</div>
        ${statusHtml}
      </div>
      <div class="inv-total-big">$${Number(inv.total).toFixed(2)}</div>
    </div>
    <div class="inv-meta">
      <div><span class="inv-label">Billed To</span><span class="inv-val">${esc(inv.client_name)}</span></div>
      <div><span class="inv-label">Due Date</span><span class="inv-val">${dueStr}</span></div>
    </div>
    <table class="inv-items-table" style="margin-top:20px;">
      <thead><tr>
        <th>Description</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Rate</th>
        <th style="text-align:right;">Total</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="inv-totals">
      <div class="inv-totals-row"><span>Subtotal</span><span>$${Number(inv.subtotal).toFixed(2)}</span></div>
      ${taxRow}
      <div class="inv-totals-row inv-totals-total"><span>Total Due</span><span>$${Number(inv.total).toFixed(2)}</span></div>
    </div>
    ${notesHtml}
    ${photosHtml}
  `;

  const footer = document.getElementById('inv-preview-footer');
  footer.innerHTML = isPaid
    ? `<span class="paid-notice" style="display:inline-block;margin:0;">Payment received — thank you!</span>`
    : (inv.square_payment_link
        ? `<a href="${esc(inv.square_payment_link)}" target="_blank" class="btn btn-primary">View Payment Link ↗</a>`
        : `<span style="font-size:13px;color:var(--gray-400);">No payment link generated.</span>`);
  footer.innerHTML += `<span class="inv-preview-hint">Client view preview</span>`;

  _currentPreviewId = id;
  _currentPreviewType = 'invoice';

  // Wire up copy-link, mark-paid, and undo-paid buttons in the extra footer row
  const copyBtn = document.getElementById('copy-link-btn');
  const markPaidBtn = document.getElementById('mark-paid-btn');
  const undoPaidBtn = document.getElementById('undo-paid-btn');
  if (copyBtn) copyBtn.style.display = (inv.square_payment_link && !isPaid) ? '' : 'none';
  if (markPaidBtn) {
    markPaidBtn.style.display = isPaid ? 'none' : '';
    markPaidBtn.textContent = 'Mark as Paid';
    markPaidBtn.disabled = false;
  }
  if (undoPaidBtn) {
    undoPaidBtn.style.display = isPaid ? '' : 'none';
    undoPaidBtn.textContent = 'Undo Paid';
    undoPaidBtn.disabled = false;
  }

  document.getElementById('inv-preview-modal').classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

function closePreviewModal() {
  document.getElementById('inv-preview-modal').classList.remove('is-open');
  document.body.style.overflow = '';
}

function handlePreviewOverlayClick(e) {
  if (e.target === document.getElementById('inv-preview-modal')) closePreviewModal();
}

function previewEstimate(id) {
  const est = estimatesCache.find(e => e.id === id);
  if (!est) { showToast('Estimate not found.', 'error'); return; }

  const biz = businessProfilesCache.find(p => p.id === est.business_profile_id);
  const bizName = biz?.name || 'InvoiceMePro';

  const statusLabel = est.status === 'approved' ? 'Approved' : est.status === 'rejected' ? 'Declined' : 'Awaiting Response';
  const statusColor = est.status === 'approved' ? '#059669' : est.status === 'rejected' ? '#dc2626' : '#d97706';
  const statusBg   = est.status === 'approved' ? '#ecfdf5' : est.status === 'rejected' ? '#fef2f2' : '#fffbeb';

  const completion = est.estimated_completion_date
    ? new Date(est.estimated_completion_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const itemRows = (est.items || []).map(item => {
    const hasQty = item.quantity != null && item.unitPrice != null;
    const net = Number(item.cost || 0);
    const disc = Math.min(Number(item.discount) || 0, net);
    const qtyLine = hasQty
      ? `<div style="font-size:12px;color:var(--gray-400);margin-top:2px;">${item.type === 'hours' ? `${item.quantity} hrs` : `×${item.quantity}`} @ $${Number(item.unitPrice).toFixed(2)}</div>`
      : '';
    const discLine = disc > 0 ? `<div style="font-size:12px;color:#059669;margin-top:1px;">✓ Discount: -$${disc.toFixed(2)}</div>` : '';
    const explLine = item.explanation ? `<div style="font-size:12px;color:var(--gray-500);margin-top:2px;">${esc(item.explanation)}</div>` : '';
    const dateLine = item.completionDate ? `<div style="font-size:11px;color:var(--gray-400);margin-top:2px;">End: ${new Date(item.completionDate + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>` : '';
    return `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--gray-100);gap:12px;">
      <div style="flex:1;">
        <div style="font-weight:500;color:var(--gray-900);">${esc(item.description)}</div>
        ${qtyLine}${discLine}${explLine}${dateLine}
      </div>
      <div style="font-weight:600;color:var(--gray-900);white-space:nowrap;">$${net.toFixed(2)}</div>
    </div>`;
  }).join('');

  const taxRow = est.tax_rate > 0
    ? `<div class="inv-totals-row"><span>Tax (${est.tax_rate}%)</span><span>$${Number(est.tax_amount).toFixed(2)}</span></div>` : '';

  const depositHtml = est.deposit_amount
    ? `<div style="margin-top:14px;padding:12px 16px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#1e40af;margin-bottom:2px;">Deposit Required to Start</div>
        <div style="font-size:22px;font-weight:800;color:#1a56db;">$${Number(est.deposit_amount).toFixed(2)}</div>
       </div>` : '';

  const photos = est.receipt_photos || [];
  window._previewPhotos = photos;
  const photosHtml = photos.length
    ? `<div style="margin-top:16px;"><div class="inv-label" style="margin-bottom:8px;">Photos</div>
       <div class="receipt-photos-wrap">${photos.map((p, i) => `<img src="${esc(p)}" class="receipt-thumb" onclick="openPhotoLightbox(window._previewPhotos,${i})">`).join('')}</div></div>`
    : '';

  const notesHtml = est.notes
    ? `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--gray-100);"><div class="inv-label">Notes</div><div class="inv-notes-text">${esc(est.notes)}</div></div>` : '';

  document.getElementById('inv-preview-body').innerHTML = `
    <div class="inv-preview-bizname">${esc(bizName)}</div>
    <div class="inv-header">
      <div>
        <div class="inv-number">${esc(est.estimate_number)}</div>
        <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;background:${statusBg};color:${statusColor};margin-top:4px;">${statusLabel}</span>
      </div>
      <div class="inv-total-big">$${Number(est.total).toFixed(2)}</div>
    </div>
    <div class="inv-meta">
      <div><span class="inv-label">Prepared For</span><span class="inv-val">${esc(est.client_name)}</span></div>
      ${completion ? `<div><span class="inv-label">Est. Completion</span><span class="inv-val">${completion}</span></div>` : ''}
    </div>
    <div style="margin-top:16px;">${itemRows}</div>
    <div class="inv-totals" style="margin-top:8px;">
      <div class="inv-totals-row"><span>Subtotal</span><span>$${Number(est.subtotal).toFixed(2)}</span></div>
      ${taxRow}
      <div class="inv-totals-row inv-totals-total"><span>Total Estimate</span><span>$${Number(est.total).toFixed(2)}</span></div>
    </div>
    ${depositHtml}${notesHtml}${photosHtml}
  `;

  const footer = document.getElementById('inv-preview-footer');
  footer.innerHTML = `<span style="font-size:13px;color:var(--gray-500);">Passcode: <code style="background:var(--gray-100);padding:2px 6px;border-radius:4px;letter-spacing:0.1em;">${esc(est.passcode || '—')}</code></span><span class="inv-preview-hint">Client view preview</span>`;

  _currentPreviewId = id;
  _currentPreviewType = 'estimate';

  const copyBtn = document.getElementById('copy-link-btn');
  const markPaidBtn = document.getElementById('mark-paid-btn');
  const undoPaidBtn2 = document.getElementById('undo-paid-btn');
  const alreadyPaid = est.deposit_paid;
  if (copyBtn) copyBtn.style.display = (est.deposit_payment_link && !alreadyPaid) ? '' : 'none';
  if (markPaidBtn) {
    markPaidBtn.style.display = est.deposit_amount ? (alreadyPaid ? 'none' : '') : 'none';
    markPaidBtn.textContent = 'Mark Deposit Paid';
    markPaidBtn.disabled = false;
  }
  if (undoPaidBtn2) undoPaidBtn2.style.display = 'none'; // undo not supported for estimates

  document.getElementById('inv-preview-modal').classList.add('is-open');
  document.body.style.overflow = 'hidden';
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

let estimatesCache = [];

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
    estimatesCache = estimates;

    if (loading) loading.style.display = 'none';
    if (!estimates.length) { if (empty) empty.style.display = ''; return; }

    if (tbody) tbody.innerHTML = estimates.map(est => {
      const completion = est.estimated_completion_date
        ? new Date(est.estimated_completion_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—';
      const statusColor = est.status === 'approved' ? 'paid' : est.status === 'rejected' ? 'rejected' : 'pending';
      return `<tr onclick="previewEstimate('${est.id}')" style="cursor:pointer;" title="Click to preview">
        <td><div class="client-name">${esc(est.client_name)}</div><div class="invoice-num">${esc(est.client_email)}</div></td>
        <td>${esc(est.estimate_number)}</td>
        <td><code style="font-size:13px;letter-spacing:0.1em;background:var(--gray-100);padding:2px 6px;border-radius:4px;">${esc(est.passcode || '—')}</code></td>
        <td>${formatDate(est.created_at)}</td>
        <td>${completion}</td>
        <td class="amount">$${Number(est.total).toFixed(2)}</td>
        <td><span class="badge badge-${statusColor}">${capitalize(est.status)}</span></td>
        <td id="msg-count-${est.id}"><span style="color:var(--gray-400);font-size:12px;">—</span></td>
        <td onclick="event.stopPropagation()" style="white-space:nowrap;">
          <div style="display:flex;gap:6px;flex-wrap:nowrap;align-items:center;">
            <button class="btn btn-sm btn-secondary" onclick="editEstimate('${est.id}')">Edit</button>
            <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:none;" onclick="deleteEstimate('${est.id}')">Delete</button>
            ${est.status === 'approved' ? `<button class="btn btn-sm btn-primary" onclick="openEstimateDetail('${est.id}')" title="Convert to invoice" style="background:#0f766e;">Invoice →</button>` : ''}
            <button class="btn btn-sm btn-secondary" onclick="saveClientFromRow('${escAttr(est.client_name)}','${escAttr(est.client_email)}','${escAttr(est.client_phone||'')}','${escAttr(est.client_company||'')}','${escAttr(est.client_address||'')}','${escAttr(est.client_city||'')}','${escAttr(est.client_state||'')}','${escAttr(est.client_zip||'')}')" title="Save client to contacts">+ Client</button>
          </div>
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

    // Show convert-to-invoice and deposit sections for approved estimates
    if (est.status === 'approved') {
      showConvertToInvoice(est);
      showDepositSection(est);
    } else {
      const section = document.getElementById('convert-invoice-section');
      if (section) section.style.display = 'none';
      const depSection = document.getElementById('deposit-section');
      if (depSection) depSection.style.display = 'none';
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

  // Show deposit deduction option if deposit exists
  const depositRow = document.getElementById('convert-deposit-row');
  const depositLabel = document.getElementById('convert-deposit-label');
  const deductCb = document.getElementById('convert-deduct-deposit');
  if (depositRow && estimate.deposit_amount && Number(estimate.deposit_amount) > 0) {
    const dep = Number(estimate.deposit_amount);
    const isPaid = estimate.deposit_paid;
    depositLabel.textContent = `Deduct deposit ${isPaid ? 'paid' : 'owed'}: $${dep.toFixed(2)}`;
    deductCb.checked = !!isPaid; // auto-check if already paid
    depositRow.style.display = '';
  } else if (depositRow) {
    depositRow.style.display = 'none';
    if (deductCb) deductCb.checked = false;
  }

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
  const deductCb = document.getElementById('convert-deduct-deposit');
  if (deductCb?.checked && currentEstimateData?.deposit_amount) {
    total = Math.max(0, total - Number(currentEstimateData.deposit_amount));
  }
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

  // Optionally deduct deposit as a credit line
  const deductCb = document.getElementById('convert-deduct-deposit');
  if (deductCb?.checked && currentEstimateData?.deposit_amount) {
    const dep = Number(currentEstimateData.deposit_amount);
    if (dep > 0) {
      invoiceItems.push({
        type: 'other',
        description: `Deposit credit (${currentEstimateData.estimate_number})`,
        quantity: 1,
        unitPrice: -dep,
      });
    }
  }

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

function addEstimateItem(desc = '', explanation = '', type = 'item', qty = 1, unitPrice = '', discount = '', completionDate = '', depositPct = '') {
  const id = ++estItemId;
  const typeOptions = EST_TYPES.map(t => `<option value="${t.value}"${t.value === type ? ' selected' : ''}>${t.label}</option>`).join('');
  const tr = document.createElement('tr');
  tr.id = `est-item-${id}`;
  tr.innerHTML = `
    <td><select id="est-type-${id}" style="width:100%;">${typeOptions}</select></td>
    <td>
      <input type="text" id="est-desc-${id}" placeholder="Description" value="${escAttr(desc)}" required oninput="recalcEstimateTotals()" style="width:100%;margin-bottom:4px;">
      <textarea id="est-expl-${id}" placeholder="Explain why (optional)..." style="width:100%;min-height:44px;font-size:12px;resize:vertical;">${escAttr(explanation)}</textarea>
    </td>
    <td><input type="number" id="est-qty-${id}" value="${escAttr(qty)}" min="0.01" step="any" oninput="recalcEstimateTotals()" style="width:100%;"></td>
    <td><input type="number" id="est-price-${id}" value="${escAttr(unitPrice)}" placeholder="0.00" min="0" step="0.01" oninput="recalcEstimateTotals()" style="width:100%;"></td>
    <td><input type="number" id="est-disc-${id}" value="${escAttr(discount)}" placeholder="0.00" min="0" step="0.01" oninput="recalcEstimateTotals()" style="width:100%;"></td>
    <td><input type="number" id="est-dep-${id}" value="${escAttr(depositPct)}" placeholder="0" min="0" max="100" step="0.1" oninput="recalcEstimateTotals()" style="width:100%;" title="Deposit % for this item"></td>
    <td><input type="date" id="est-compdate-${id}" value="${escAttr(completionDate)}" onchange="recalcEstimateTotals()" style="width:100%;"></td>
    <td style="text-align:right;font-weight:500;white-space:nowrap;" id="est-line-total-${id}">$0.00</td>
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
    const id = row.id.replace('est-item-', '');
    const qty = parseFloat(document.getElementById(`est-qty-${id}`)?.value) || 1;
    const unitPrice = parseFloat(document.getElementById(`est-price-${id}`)?.value) || 0;
    const lineTotal = qty * unitPrice;
    const discount = Math.min(parseFloat(document.getElementById(`est-disc-${id}`)?.value) || 0, lineTotal);
    const cost = lineTotal - discount;
    const depositPct = parseFloat(document.getElementById(`est-dep-${id}`)?.value) || 0;
    return {
      type: document.getElementById(`est-type-${id}`)?.value || 'item',
      description: document.getElementById(`est-desc-${id}`)?.value.trim() || '',
      explanation: document.getElementById(`est-expl-${id}`)?.value.trim() || '',
      quantity: qty,
      unitPrice,
      discount,
      cost,
      depositPct,
      completionDate: document.getElementById(`est-compdate-${id}`)?.value || null,
    };
  });
}

function recalcEstimateTotals() {
  const items = getEstimateItems();
  // Update per-line totals
  Array.from(document.getElementById('est-items-tbody').querySelectorAll('tr')).forEach((row, idx) => {
    const id = row.id.replace('est-item-', '');
    const el = document.getElementById(`est-line-total-${id}`);
    if (el) el.textContent = `$${(items[idx]?.cost || 0).toFixed(2)}`;
  });
  const useTax = document.getElementById('est-tax-toggle')?.checked;
  const taxRate = useTax ? (parseFloat(document.getElementById('est-tax-rate')?.value) || 0) : 0;
  const subtotal = items.reduce((s, i) => s + i.cost, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

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

  // Auto-calculate deposit from item deposit percentages
  const autoDeposit = items.reduce((s, i) => s + (i.cost * (i.depositPct || 0) / 100), 0);
  const depositInput = document.getElementById('est-deposit');
  const depositAutoLabel = document.getElementById('est-deposit-auto-label');
  if (autoDeposit > 0 && depositInput) {
    depositInput.value = autoDeposit.toFixed(2);
    if (depositAutoLabel) depositAutoLabel.style.display = '';
  } else if (depositAutoLabel) {
    depositAutoLabel.style.display = 'none';
  }

  const completionWrap = document.getElementById('est-completion-display');
  const dates = items.map(i => i.completionDate).filter(Boolean).sort();
  const latestDate = dates.length ? dates[dates.length - 1] : null;
  if (latestDate) {
    const dateStr = new Date(latestDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
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
  document.getElementById('est-client-phone').value = c.phone || '';
  document.getElementById('est-client-company').value = c.company || '';
  document.getElementById('est-client-address').value = c.address || '';
  document.getElementById('est-client-city').value = c.city || '';
  document.getElementById('est-client-state').value = c.state || '';
  document.getElementById('est-client-zip').value = c.zip || '';
}

async function saveClientFromRow(name, email, phone, company, address, city, state, zip) {
  if (!name || !email) { showToast('No client info to save.', 'error'); return; }
  try {
    const res = await fetch('/api/save-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone: phone || '', company: company || '', address: address || '', city: city || '', state: state || '', zip: zip || '' }),
    });
    if (!res.ok) throw new Error('Failed');
    await loadClients();
    showToast(`${name} saved to Clients.`, 'success');
  } catch { showToast('Failed to save client.', 'error'); }
}

async function submitEstimate(e) {
  e.preventDefault();
  const items = getEstimateItems();
  if (!items.length || items.some(i => !i.description || i.cost < 0)) {
    showToast('Please complete all estimate items.', 'error'); return;
  }

  const useTax = document.getElementById('est-tax-toggle').checked;
  const taxRate = useTax ? (parseFloat(document.getElementById('est-tax-rate').value) || 0) : 0;

  const receiptPhotos = await collectPhotos('est-photos');

  const payload = {
    clientName: document.getElementById('est-client-name').value.trim(),
    clientEmail: document.getElementById('est-client-email').value.trim(),
    businessProfileId: document.getElementById('est-business-select').value || null,
    clientPhone: buildPhone('est-client-phone-cc', 'est-client-phone'),
    clientCompany: document.getElementById('est-client-company').value.trim(),
    clientAddress: document.getElementById('est-client-address').value.trim(),
    clientCity: document.getElementById('est-client-city').value.trim(),
    clientState: document.getElementById('est-client-state').value.trim(),
    clientZip: document.getElementById('est-client-zip').value.trim(),
    items,
    taxRate,
    notes: document.getElementById('est-notes').value.trim(),
    sendEmail: document.getElementById('est-send-email').checked,
    sendSmsNotification: document.getElementById('est-send-sms').checked,
    receiptPhotos,
    depositAmount: parseFloat(document.getElementById('est-deposit').value) || null,
  };

  if (document.getElementById('est-save-client-check').checked) {
    fetch('/api/save-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: payload.clientName, email: payload.clientEmail, phone: payload.clientPhone, company: payload.clientCompany, address: payload.clientAddress, city: payload.clientCity, state: payload.clientState, zip: payload.clientZip }),
    }).then(() => loadClients()).catch(() => {});
  }

  const btn = document.getElementById('est-submit-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Sending...';

  try {
    const res = await fetch('/api/create-estimate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${data.error || 'Failed'}${data.detail ? ': ' + data.detail : ''}`);

    resetEstimateForm();
    loadEstimates();
    showTab('dashboard');
    showToast('Estimate Sent!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = 'Send Estimate';
  }
}

function resetEstimateForm() {
  currentEditEstimateId = null;
  document.getElementById('estimate-form').reset();
  document.getElementById('est-items-tbody').innerHTML = '';
  estItemId = 0;
  document.getElementById('est-tax-input-wrap').style.display = 'none';
  document.getElementById('est-tax-row').style.display = 'none';
  document.getElementById('est-completion-display').style.display = 'none';
  const photoPreview = document.getElementById('est-photo-preview');
  if (photoPreview) photoPreview.innerHTML = '';
  ['est-client-name','est-client-email','est-client-phone','est-client-company','est-client-address','est-client-city','est-client-state','est-client-zip','est-notes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  recalcEstimateTotals();
}

// Populate estimate client dropdown from existing clientsCache
function populateEstimateClientDropdown() {
  const sel = document.getElementById('est-client-select');
  if (!sel || !clientsCache.length) return;
  sel.innerHTML = '<option value="">— Select a saved client or fill in below —</option>' +
    clientsCache.map(c => `<option value="${c.id}">${esc(c.name)}${c.company ? ` (${esc(c.company)})` : ''}</option>`).join('');
}

// ─── Dedicated Edit Tab ───────────────────────────────────────────────────────

let currentEditInvoiceId = null;
let currentEditEstimateId = null;
let editItemId = 0;
let editEstItemId = 0;

function openEditTab() {
  document.querySelectorAll('.mgr-tab').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.mgr-nav-item').forEach(a => a.classList.remove('active'));
  document.getElementById('tab-edit').style.display = '';
  // Populate business dropdown in edit tab
  const sel = document.getElementById('edit-business-select');
  const opts = businessProfilesCache.map(p => `<option value="${p.id}">${p.nickname || p.name}</option>`).join('');
  sel.innerHTML = '<option value="">— Select a business profile —</option>' + opts;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function discardEdit() {
  currentEditInvoiceId = null;
  currentEditEstimateId = null;
  document.getElementById('tab-edit').style.display = 'none';
  document.getElementById('tab-dashboard').style.display = '';
  const dashLink = document.querySelector('.mgr-nav-item');
  if (dashLink) dashLink.classList.add('active');
}

function editInvoice(id) {
  const inv = invoicesCache.find(i => i.id === id);
  if (!inv) { showToast('Invoice not found.', 'error'); return; }
  currentEditInvoiceId = id;
  currentEditEstimateId = null;

  document.getElementById('edit-banner-title').textContent = `Editing Invoice — ${inv.invoice_number}`;
  document.getElementById('edit-invoice-section').style.display = '';
  document.getElementById('edit-estimate-section').style.display = 'none';
  document.getElementById('edit-submit-btn').textContent = 'Save Invoice Changes';

  // Client fields
  document.getElementById('edit-client-name').value = inv.client_name || '';
  document.getElementById('edit-client-email').value = inv.client_email || '';
  document.getElementById('edit-client-phone').value = inv.client_phone || '';
  document.getElementById('edit-client-company').value = inv.client_company || '';
  document.getElementById('edit-client-address').value = inv.client_address || '';
  document.getElementById('edit-client-city').value = inv.client_city || '';
  document.getElementById('edit-client-state').value = inv.client_state || '';
  document.getElementById('edit-client-zip').value = inv.client_zip || '';
  document.getElementById('edit-due-date').value = inv.due_date ? inv.due_date.split('T')[0] : '';
  document.getElementById('edit-notes').value = inv.notes || '';

  // Tax
  const useTax = inv.tax_rate > 0;
  document.getElementById('edit-tax-toggle').checked = useTax;
  document.getElementById('edit-tax-input-wrap').style.display = useTax ? 'flex' : 'none';
  if (useTax) document.getElementById('edit-tax-rate').value = inv.tax_rate;

  // Line items
  document.getElementById('edit-items-tbody').innerHTML = '';
  editItemId = 0;
  (inv.items || []).forEach(item => addEditItem(item.description, item.type || 'item', item.quantity, item.unitPrice, item.discount || '', item.workDate || ''));
  recalcEditTotals();

  loadEditPhotos(inv.receipt_photos);
  openEditTab();
  if (inv.business_profile_id) document.getElementById('edit-business-select').value = inv.business_profile_id;
}

function editEstimate(id) {
  const est = estimatesCache.find(e => e.id === id);
  if (!est) { showToast('Estimate not found.', 'error'); return; }
  currentEditEstimateId = id;
  currentEditInvoiceId = null;

  document.getElementById('edit-banner-title').textContent = `Editing Estimate — ${est.estimate_number}`;
  document.getElementById('edit-invoice-section').style.display = 'none';
  document.getElementById('edit-estimate-section').style.display = '';
  document.getElementById('edit-submit-btn').textContent = 'Save Estimate Changes';

  // Client fields
  document.getElementById('edit-client-name').value = est.client_name || '';
  document.getElementById('edit-client-email').value = est.client_email || '';
  document.getElementById('edit-client-phone').value = est.client_phone || '';
  document.getElementById('edit-client-company').value = est.client_company || '';
  document.getElementById('edit-client-address').value = est.client_address || '';
  document.getElementById('edit-client-city').value = est.client_city || '';
  document.getElementById('edit-client-state').value = est.client_state || '';
  document.getElementById('edit-client-zip').value = est.client_zip || '';
  document.getElementById('edit-notes').value = est.notes || '';

  // Tax
  const useTax = est.tax_rate > 0;
  document.getElementById('edit-est-tax-toggle').checked = useTax;
  document.getElementById('edit-est-tax-input-wrap').style.display = useTax ? 'flex' : 'none';
  if (useTax) document.getElementById('edit-est-tax-rate').value = est.tax_rate;

  // Items
  document.getElementById('edit-est-items-tbody').innerHTML = '';
  editEstItemId = 0;
  (est.items || []).forEach(item => {
    const qty = item.quantity || 1;
    const unitPrice = item.unitPrice != null ? item.unitPrice : (item.cost || 0);
    const discount = item.discount || 0;
    // Backward compat: old items had estimatedDays, new ones have completionDate
    const completionDate = item.completionDate || '';
    addEditEstimateItem(item.description, item.explanation || '', item.type || 'item', qty, unitPrice, discount, completionDate, item.depositPct || 0);
  });
  document.getElementById('edit-est-deposit').value = est.deposit_amount || '';
  recalcEditEstimateTotals();

  loadEditPhotos(est.receipt_photos);
  openEditTab();
  if (est.business_profile_id) document.getElementById('edit-business-select').value = est.business_profile_id;
}

async function submitEdit(e) {
  e.preventDefault();
  const clientName = document.getElementById('edit-client-name').value.trim();
  const clientEmail = document.getElementById('edit-client-email').value.trim();
  if (!clientName || !clientEmail) { showToast('Name and email required.', 'error'); return; }

  const btn = document.getElementById('edit-submit-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving...';

  const clientPhone = buildPhone('edit-client-phone-cc', 'edit-client-phone');
  const resendEmail = document.getElementById('edit-send-email').checked;
  const resendSms = document.getElementById('edit-send-sms').checked;
  const businessProfileId = document.getElementById('edit-business-select').value || null;
  const notes = document.getElementById('edit-notes').value.trim();

  try {
    let url, payload;

    if (currentEditInvoiceId) {
      const useTax = document.getElementById('edit-tax-toggle').checked;
      const taxRate = useTax ? (parseFloat(document.getElementById('edit-tax-rate').value) || 0) : 0;
      const items = getEditItems();
      if (!items.length) { showToast('Add at least one line item.', 'error'); btn.disabled = false; btn.textContent = 'Save Invoice Changes'; return; }
      url = '/api/update-invoice';
      payload = {
        invoiceId: currentEditInvoiceId, clientName, clientEmail, clientPhone,
        clientCompany: document.getElementById('edit-client-company').value.trim(),
        clientAddress: document.getElementById('edit-client-address').value.trim(),
        clientCity: document.getElementById('edit-client-city').value.trim(),
        clientState: document.getElementById('edit-client-state').value.trim(),
        clientZip: document.getElementById('edit-client-zip').value.trim(),
        dueDate: document.getElementById('edit-due-date').value || null,
        items, taxRate, notes, resendEmail, resendSms, businessProfileId,
        receiptPhotos: [..._editPhotos, ..._editNewPhotos],
      };
    } else {
      const useTax = document.getElementById('edit-est-tax-toggle').checked;
      const taxRate = useTax ? (parseFloat(document.getElementById('edit-est-tax-rate').value) || 0) : 0;
      const items = getEditEstimateItems();
      if (!items.length) { showToast('Add at least one item.', 'error'); btn.disabled = false; btn.textContent = 'Save Estimate Changes'; return; }
      url = '/api/update-estimate';
      payload = {
        estimateId: currentEditEstimateId, clientName, clientEmail, clientPhone,
        clientCompany: document.getElementById('edit-client-company').value.trim(),
        clientAddress: document.getElementById('edit-client-address').value.trim(),
        clientCity: document.getElementById('edit-client-city').value.trim(),
        clientState: document.getElementById('edit-client-state').value.trim(),
        clientZip: document.getElementById('edit-client-zip').value.trim(),
        items, taxRate, notes, resendEmail, resendSms, businessProfileId,
        receiptPhotos: [..._editPhotos, ..._editNewPhotos],
        depositAmount: parseFloat(document.getElementById('edit-est-deposit').value) || null,
      };
    }

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    showToast('Changes saved!', 'success');
    discardEdit();
    loadInvoices();
    loadEstimates();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = currentEditInvoiceId ? 'Save Invoice Changes' : 'Save Estimate Changes';
  }
}

// Edit tab line items — invoice
function addEditItem(desc = '', type = 'item', qty = 1, price = '', discount = '', workDate = '') {
  const id = ++editItemId;
  const typeOptions = ITEM_TYPES.map(t => `<option value="${t.value}"${t.value === type ? ' selected' : ''}>${t.label}</option>`).join('');
  const tr = document.createElement('tr');
  tr.id = `edit-item-${id}`;
  tr.innerHTML = `
    <td><select id="edit-itype-${id}" onchange="recalcEditTotals()" style="width:100%;">${typeOptions}</select></td>
    <td>
      <input type="text" id="edit-desc-${id}" value="${escHtmlJs(desc)}" placeholder="Description" style="width:100%;margin-bottom:4px;">
      <input type="date" id="edit-workdate-${id}" value="${workDate}" style="width:100%;font-size:12px;">
    </td>
    <td><input type="number" id="edit-qty-${id}" value="${qty}" min="0.01" step="any" oninput="recalcEditTotals()" style="width:100%;"></td>
    <td><input type="number" id="edit-price-${id}" value="${price}" min="0" step="0.01" oninput="recalcEditTotals()" placeholder="0.00" style="width:100%;"></td>
    <td><input type="number" id="edit-discount-${id}" value="${discount}" min="0" step="0.01" oninput="recalcEditTotals()" placeholder="0.00" style="width:100%;"></td>
    <td style="text-align:right;font-weight:600;" id="edit-linetotal-${id}">$0.00</td>
    <td><button type="button" onclick="document.getElementById('edit-item-${id}').remove();recalcEditTotals();" style="background:none;border:none;cursor:pointer;color:var(--gray-400);font-size:18px;">×</button></td>`;
  document.getElementById('edit-items-tbody').appendChild(tr);
  recalcEditTotals();
}

function getEditItems() {
  const rows = document.querySelectorAll('#edit-items-tbody tr');
  return Array.from(rows).map(row => {
    const id = row.id.replace('edit-item-', '');
    return {
      type: document.getElementById(`edit-itype-${id}`)?.value || 'item',
      description: document.getElementById(`edit-desc-${id}`)?.value.trim() || '',
      quantity: parseFloat(document.getElementById(`edit-qty-${id}`)?.value) || 1,
      unitPrice: parseFloat(document.getElementById(`edit-price-${id}`)?.value) || 0,
      discount: parseFloat(document.getElementById(`edit-discount-${id}`)?.value) || 0,
      workDate: document.getElementById(`edit-workdate-${id}`)?.value || '',
    };
  }).filter(i => i.description);
}

function recalcEditTotals() {
  const useTax = document.getElementById('edit-tax-toggle').checked;
  const taxRate = useTax ? (parseFloat(document.getElementById('edit-tax-rate').value) || 0) : 0;
  let subtotal = 0;
  document.querySelectorAll('#edit-items-tbody tr').forEach(row => {
    const id = row.id.replace('edit-item-', '');
    const qty = parseFloat(document.getElementById(`edit-qty-${id}`)?.value) || 0;
    const price = parseFloat(document.getElementById(`edit-price-${id}`)?.value) || 0;
    const disc = parseFloat(document.getElementById(`edit-discount-${id}`)?.value) || 0;
    const lt = qty * price;
    const net = lt - Math.min(disc, lt);
    subtotal += net;
    const el = document.getElementById(`edit-linetotal-${id}`);
    if (el) el.textContent = `$${net.toFixed(2)}`;
  });
  const taxAmt = subtotal * (taxRate / 100);
  document.getElementById('edit-subtotal-display').textContent = `$${subtotal.toFixed(2)}`;
  const taxRow = document.getElementById('edit-tax-row');
  if (taxRow) taxRow.style.display = taxRate > 0 ? '' : 'none';
  document.getElementById('edit-tax-display').textContent = `$${taxAmt.toFixed(2)}`;
  document.getElementById('edit-tax-label').textContent = `Tax (${taxRate}%)`;
  document.getElementById('edit-total-display').textContent = `$${(subtotal + taxAmt).toFixed(2)}`;
}

function toggleEditTax() {
  const wrap = document.getElementById('edit-tax-input-wrap');
  wrap.style.display = document.getElementById('edit-tax-toggle').checked ? 'flex' : 'none';
  recalcEditTotals();
}

// Edit tab line items — estimate
function addEditEstimateItem(desc = '', explanation = '', type = 'item', qty = 1, unitPrice = '', discount = '', completionDate = '', depositPct = '') {
  const id = ++editEstItemId;
  const typeOptions = ITEM_TYPES.map(t => `<option value="${t.value}"${t.value === type ? ' selected' : ''}>${t.label}</option>`).join('');
  const tr = document.createElement('tr');
  tr.id = `edit-est-item-${id}`;
  tr.innerHTML = `
    <td><select id="edit-est-type-${id}" style="width:100%;">${typeOptions}</select></td>
    <td>
      <input type="text" id="edit-est-desc-${id}" value="${escHtmlJs(desc)}" placeholder="Description" style="width:100%;margin-bottom:4px;">
      <input type="text" id="edit-est-expl-${id}" value="${escHtmlJs(explanation)}" placeholder="Explanation (optional)" style="width:100%;font-size:12px;color:var(--gray-500);">
    </td>
    <td><input type="number" id="edit-est-qty-${id}" value="${escHtmlJs(qty)}" min="0.01" step="any" oninput="recalcEditEstimateTotals()" style="width:100%;"></td>
    <td><input type="number" id="edit-est-price-${id}" value="${escHtmlJs(unitPrice)}" min="0" step="0.01" oninput="recalcEditEstimateTotals()" placeholder="0.00" style="width:100%;"></td>
    <td><input type="number" id="edit-est-disc-${id}" value="${escHtmlJs(discount)}" min="0" step="0.01" oninput="recalcEditEstimateTotals()" placeholder="0.00" style="width:100%;"></td>
    <td><input type="number" id="edit-est-dep-${id}" value="${escHtmlJs(depositPct)}" placeholder="0" min="0" max="100" step="0.1" oninput="recalcEditEstimateTotals()" style="width:100%;" title="Deposit % for this item"></td>
    <td><input type="date" id="edit-est-compdate-${id}" value="${escHtmlJs(completionDate)}" onchange="recalcEditEstimateTotals()" style="width:100%;"></td>
    <td style="text-align:right;font-weight:500;white-space:nowrap;" id="edit-est-line-total-${id}">$0.00</td>
    <td><button type="button" onclick="document.getElementById('edit-est-item-${id}').remove();recalcEditEstimateTotals();" style="background:none;border:none;cursor:pointer;color:var(--gray-400);font-size:18px;">×</button></td>`;
  document.getElementById('edit-est-items-tbody').appendChild(tr);
  recalcEditEstimateTotals();
}

function getEditEstimateItems() {
  return Array.from(document.querySelectorAll('#edit-est-items-tbody tr')).map(row => {
    const id = row.id.replace('edit-est-item-', '');
    const qty = parseFloat(document.getElementById(`edit-est-qty-${id}`)?.value) || 1;
    const unitPrice = parseFloat(document.getElementById(`edit-est-price-${id}`)?.value) || 0;
    const lineTotal = qty * unitPrice;
    const discount = Math.min(parseFloat(document.getElementById(`edit-est-disc-${id}`)?.value) || 0, lineTotal);
    const cost = lineTotal - discount;
    const depositPct = parseFloat(document.getElementById(`edit-est-dep-${id}`)?.value) || 0;
    return {
      type: document.getElementById(`edit-est-type-${id}`)?.value || 'item',
      description: document.getElementById(`edit-est-desc-${id}`)?.value.trim() || '',
      explanation: document.getElementById(`edit-est-expl-${id}`)?.value.trim() || '',
      quantity: qty,
      unitPrice,
      discount,
      cost,
      depositPct,
      completionDate: document.getElementById(`edit-est-compdate-${id}`)?.value || null,
    };
  }).filter(i => i.description);
}

function recalcEditEstimateTotals() {
  const items = getEditEstimateItems();
  // Update per-line totals
  Array.from(document.querySelectorAll('#edit-est-items-tbody tr')).forEach((row, idx) => {
    const id = row.id.replace('edit-est-item-', '');
    const el = document.getElementById(`edit-est-line-total-${id}`);
    if (el) el.textContent = `$${(items[idx]?.cost || 0).toFixed(2)}`;
  });
  const useTax = document.getElementById('edit-est-tax-toggle').checked;
  const taxRate = useTax ? (parseFloat(document.getElementById('edit-est-tax-rate').value) || 0) : 0;
  const subtotal = items.reduce((s, i) => s + i.cost, 0);
  const taxAmt = subtotal * (taxRate / 100);
  document.getElementById('edit-est-subtotal-display').textContent = `$${subtotal.toFixed(2)}`;

  // Auto-calculate deposit from item deposit percentages
  const autoDeposit = items.reduce((s, i) => s + (i.cost * (i.depositPct || 0) / 100), 0);
  const editDepInput = document.getElementById('edit-est-deposit');
  const editDepLabel = document.getElementById('edit-est-deposit-auto-label');
  if (autoDeposit > 0 && editDepInput) {
    editDepInput.value = autoDeposit.toFixed(2);
    if (editDepLabel) editDepLabel.style.display = '';
  } else if (editDepLabel) {
    editDepLabel.style.display = 'none';
  }

  const taxRow = document.getElementById('edit-est-tax-row');
  if (taxRow) taxRow.style.display = taxRate > 0 ? '' : 'none';
  document.getElementById('edit-est-tax-display').textContent = `$${taxAmt.toFixed(2)}`;
  document.getElementById('edit-est-tax-label').textContent = `Tax (${taxRate}%)`;
  document.getElementById('edit-est-total-display').textContent = `$${(subtotal + taxAmt).toFixed(2)}`;

  const compWrap = document.getElementById('edit-est-completion-display');
  if (compWrap) {
    const dates = items.map(i => i.completionDate).filter(Boolean).sort();
    const latest = dates.length ? dates[dates.length - 1] : null;
    if (latest) {
      document.getElementById('edit-est-completion-date').textContent = new Date(latest + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      compWrap.style.display = '';
    } else { compWrap.style.display = 'none'; }
  }
}

function toggleEditEstimateTax() {
  const wrap = document.getElementById('edit-est-tax-input-wrap');
  wrap.style.display = document.getElementById('edit-est-tax-toggle').checked ? 'flex' : 'none';
  recalcEditEstimateTotals();
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function deleteInvoice(id) {
  const inv = invoicesCache.find(i => i.id === id);
  if (!confirm(`Delete invoice ${inv?.invoice_number || ''}? This cannot be undone.`)) return;
  try {
    const res = await fetch('/api/delete-invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (res.ok) { showToast('Invoice deleted.', 'success'); loadInvoices(); }
    else showToast('Failed to delete.', 'error');
  } catch { showToast('Failed to delete.', 'error'); }
}

async function deleteEstimate(id) {
  const est = estimatesCache.find(e => e.id === id);
  if (!confirm(`Delete estimate ${est?.estimate_number || ''}? This cannot be undone.`)) return;
  try {
    const res = await fetch('/api/delete-estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (res.ok) { showToast('Estimate deleted.', 'success'); loadEstimates(); }
    else showToast('Failed to delete.', 'error');
  } catch { showToast('Failed to delete.', 'error'); }
}

// ─── Edit-form photo management ───────────────────────────────────────────────

let _editPhotos = [];    // existing URLs kept so far
let _editNewPhotos = []; // newly compressed base64 strings

function loadEditPhotos(photos) {
  _editPhotos = [...(photos || [])];
  _editNewPhotos = [];
  renderEditExistingPhotos();
  document.getElementById('edit-new-photo-preview').innerHTML = '';
  const input = document.getElementById('edit-photos');
  if (input) input.value = '';
}

function renderEditExistingPhotos() {
  const wrap = document.getElementById('edit-existing-photos');
  if (!wrap) return;
  if (!_editPhotos.length) { wrap.innerHTML = '<span style="font-size:13px;color:var(--gray-400);">No photos attached.</span>'; return; }
  wrap.innerHTML = _editPhotos.map((url, i) => `
    <div class="receipt-thumb-wrap">
      <img src="${esc(url)}" class="receipt-thumb" onclick="openPhotoLightbox(_editPhotos,${i})">
      <button type="button" class="receipt-thumb-remove" onclick="removeEditPhoto(${i})" title="Remove photo">✕</button>
    </div>`).join('');
}

function removeEditPhoto(index) {
  _editPhotos.splice(index, 1);
  renderEditExistingPhotos();
}

async function addEditPhotos(input) {
  const files = Array.from(input.files).slice(0, Math.max(0, 5 - _editPhotos.length - _editNewPhotos.length));
  if (!files.length) return;
  const compressed = await Promise.all(files.map(compressPhoto));
  _editNewPhotos.push(...compressed);
  // Show previews of new photos
  const wrap = document.getElementById('edit-new-photo-preview');
  _editNewPhotos.forEach((dataUrl, i) => {
    if (wrap.children[i]) return; // already shown
    const div = document.createElement('div');
    div.className = 'receipt-thumb-wrap';
    div.innerHTML = `<img src="${dataUrl}" class="receipt-thumb"><button type="button" class="receipt-thumb-remove" onclick="removeEditNewPhoto(${i})" title="Remove">✕</button>`;
    wrap.appendChild(div);
  });
  input.value = '';
}

function removeEditNewPhoto(index) {
  _editNewPhotos.splice(index, 1);
  // Re-render the new photo preview strip
  const wrap = document.getElementById('edit-new-photo-preview');
  wrap.innerHTML = '';
  _editNewPhotos.forEach((dataUrl, i) => {
    const div = document.createElement('div');
    div.className = 'receipt-thumb-wrap';
    div.innerHTML = `<img src="${dataUrl}" class="receipt-thumb"><button type="button" class="receipt-thumb-remove" onclick="removeEditNewPhoto(${i})" title="Remove">✕</button>`;
    wrap.appendChild(div);
  });
}

// ─── Photo helpers ────────────────────────────────────────────────────────────

function previewPhotos(input, previewId) {
  const wrap = document.getElementById(previewId);
  if (!wrap) return;
  wrap.innerHTML = '';
  const files = Array.from(input.files).slice(0, 5);
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.className = 'receipt-thumb';
      img.title = file.name;
      wrap.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
}

function compressPhoto(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1800;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
        else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function collectPhotos(inputId) {
  const input = document.getElementById(inputId);
  if (!input?.files?.length) return [];
  const files = Array.from(input.files).slice(0, 5);
  return Promise.all(files.map(compressPhoto));
}

// ─── Deposit / Prepayment ────────────────────────────────────────────────────

function showDepositSection(estimate) {
  const section = document.getElementById('deposit-section');
  const existing = document.getElementById('deposit-existing');
  const resultEl = document.getElementById('deposit-result');
  if (!section) return;

  section.style.display = '';
  resultEl.innerHTML = '';

  if (estimate.deposit_payment_link) {
    const paidHtml = estimate.deposit_paid
      ? `<span style="color:var(--green);font-weight:600;">✓ Deposit paid</span>`
      : `<span style="color:#92400e;font-weight:600;">Awaiting payment</span> — <a href="${esc(estimate.deposit_payment_link)}" target="_blank" style="color:var(--blue);">View payment link</a>`;
    existing.innerHTML = `Deposit request: <strong>$${Number(estimate.deposit_amount).toFixed(2)}</strong> &nbsp;·&nbsp; ${paidHtml}`;
    existing.style.display = '';
  } else {
    existing.style.display = 'none';
  }
}

async function createDeposit() {
  if (!currentEstimateId) return;
  const amount = parseFloat(document.getElementById('deposit-amount-input').value);
  if (!amount || amount <= 0) { showToast('Enter a valid deposit amount.', 'error'); return; }

  const btn = document.querySelector('#deposit-section .btn-primary');
  btn.disabled = true; btn.textContent = 'Creating...';

  try {
    const res = await fetch('/api/create-deposit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estimateId: currentEstimateId, depositAmount: amount }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${data.error || 'Failed'}${data.detail ? ': ' + data.detail : ''}`);

    document.getElementById('deposit-result').innerHTML =
      `<span style="color:var(--green);font-weight:600;">Deposit request sent!</span> <a href="${esc(data.deposit_payment_link)}" target="_blank" style="color:var(--blue);">View link</a>`;
    document.getElementById('deposit-existing').innerHTML =
      `Deposit request: <strong>$${Number(data.deposit_amount).toFixed(2)}</strong> &nbsp;·&nbsp; <span style="color:#92400e;font-weight:600;">Awaiting payment</span> — <a href="${esc(data.deposit_payment_link)}" target="_blank" style="color:var(--blue);">View link</a>`;
    document.getElementById('deposit-existing').style.display = '';
    showToast('Deposit request sent to client!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Send Deposit Request';
  }
}

// ─── Sync from Square ─────────────────────────────────────────────────────────

async function syncSquarePayments() {
  const btn = document.getElementById('sync-btn');
  btn.disabled = true; btn.textContent = 'Syncing...';
  try {
    const res = await fetch('/api/sync-square-payments', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sync failed');
    const msg = `Sync complete — ${data.invoicesUpdated} invoice(s) and ${data.depositsUpdated} deposit(s) updated.`;
    showToast(msg, 'success');
    loadInvoices();
    loadEstimates();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Sync from Square';
  }
}

// ─── Quick service call presets ────────────────────────────────────────────────

const SERVICE_CALL_LABEL = 'Service Call';

function quickServiceCall(price, mode = 'new') {
  if (mode === 'edit') {
    addEditItem(SERVICE_CALL_LABEL, 'service', 1, price);
  } else {
    addItem(SERVICE_CALL_LABEL, 'service', 1, price);
  }
}

function quickEstServiceCall(price, mode = 'new') {
  if (mode === 'edit') {
    addEditEstimateItem(SERVICE_CALL_LABEL, '', 'service', 1, price);
  } else {
    addEstimateItem(SERVICE_CALL_LABEL, '', 'service', 1, price);
  }
}

// ─── Copy payment link ─────────────────────────────────────────────────────────

let _currentPreviewId = null;
let _currentPreviewType = 'invoice'; // 'invoice' or 'estimate'

function copyPasscode(code, el) {
  if (!code) return;
  navigator.clipboard.writeText(code).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = code; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
  });
  const orig = el.textContent;
  el.textContent = 'Copied!';
  el.style.background = '#dcfce7'; el.style.color = '#166534';
  setTimeout(() => { el.textContent = orig; el.style.background = ''; el.style.color = ''; }, 1500);
}

function copyPaymentLink(url) {
  if (!url) { showToast('No payment link available.', 'error'); return; }
  navigator.clipboard.writeText(url).then(() => {
    showToast('Payment link copied!', 'success');
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Payment link copied!', 'success');
  });
}

function copyPreviewLink() {
  const inv = _currentPreviewType === 'invoice'
    ? invoicesCache.find(i => i.id === _currentPreviewId)
    : estimatesCache.find(e => e.id === _currentPreviewId);
  const url = inv?.square_payment_link || inv?.deposit_payment_link;
  copyPaymentLink(url);
}

// ─── Mark as paid ──────────────────────────────────────────────────────────────

async function markCurrentPaid() {
  if (!_currentPreviewId) return;
  const label = _currentPreviewType === 'invoice' ? 'invoice' : 'estimate deposit';
  if (!confirm(`Mark this ${label} as paid?`)) return;

  const btn = document.getElementById('mark-paid-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    const res = await fetch('/api/mark-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: _currentPreviewId, type: _currentPreviewType }),
    });
    if (!res.ok) throw new Error('Failed to mark paid');
    showToast('Marked as paid!', 'success');
    closePreviewModal();
    loadInvoices();
    loadEstimates();
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false; btn.textContent = 'Mark as Paid';
  }
}

async function undoMarkPaid() {
  if (!_currentPreviewId) return;
  if (!confirm('Undo paid status? This will create a new Square payment link and reset the invoice to pending.')) return;

  const btn = document.getElementById('undo-paid-btn');
  btn.disabled = true; btn.textContent = 'Working...';

  try {
    const res = await fetch('/api/recreate-payment-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId: _currentPreviewId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to recreate payment link');
    showToast('Invoice reset to pending with new payment link!', 'success');
    closePreviewModal();
    loadInvoices();
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false; btn.textContent = 'Undo Paid';
  }
}

async function markInvoicePaidFromRow(id) {
  const inv = invoicesCache.find(i => i.id === id);
  if (!confirm(`Mark ${inv?.invoice_number || 'invoice'} as paid?`)) return;
  try {
    const res = await fetch('/api/mark-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, type: 'invoice' }),
    });
    if (!res.ok) throw new Error('Failed');
    showToast('Invoice marked as paid!', 'success');
    loadInvoices();
  } catch { showToast('Failed to mark paid.', 'error'); }
}

// ─── Print / Save PDF ──────────────────────────────────────────────────────────

function printReceipt() {
  const bodyEl = document.getElementById('inv-preview-body');
  if (!bodyEl || !bodyEl.innerHTML.trim()) {
    showToast('Nothing to print.', 'error'); return;
  }
  const inv = _currentPreviewType === 'invoice'
    ? invoicesCache.find(i => i.id === _currentPreviewId)
    : estimatesCache.find(e => e.id === _currentPreviewId);
  const isPaid = inv?.status === 'paid';

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head>
  <meta charset="UTF-8">
  <title>Invoice Print</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #111; font-size: 14px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { padding: 8px 10px; }
    thead th { border-bottom: 2px solid #e5e7eb; font-size: 11px; text-transform: uppercase; color: #6b7280; }
    .inv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .inv-number { font-size: 15px; font-weight: 700; color: #374151; }
    .inv-total-big { font-size: 30px; font-weight: 800; color: #1a56db; }
    .inv-meta { display: flex; gap: 32px; margin-bottom: 16px; font-size: 13px; }
    .inv-label { font-size: 11px; text-transform: uppercase; color: #9ca3af; display: block; margin-bottom: 2px; }
    .inv-val { font-weight: 600; color: #111827; }
    .inv-totals { margin-top: 12px; text-align: right; }
    .inv-totals-row { display: flex; justify-content: flex-end; gap: 40px; padding: 4px 0; font-size: 14px; }
    .inv-totals-total { font-weight: 800; font-size: 16px; border-top: 2px solid #e5e7eb; padding-top: 8px; }
    .inv-preview-bizname { font-size: 22px; font-weight: 800; color: #111827; margin-bottom: 18px; }
    .inv-notes-text { font-size: 13px; color: #374151; margin-top: 4px; white-space: pre-wrap; }
    .inv-status-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .inv-status-paid { background: #ecfdf5; color: #059669; }
    .inv-status-pending { background: #fff7ed; color: #c2410c; }
    .work-date-header { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; background: #f9fafb; padding: 6px 10px; }
    .item-type-tag { font-size: 10px; color: #9ca3af; }
    .unpaid-stamp { text-align: center; margin: 20px 0; padding: 12px; border: 3px solid #dc2626; border-radius: 8px; color: #dc2626; font-size: 20px; font-weight: 900; letter-spacing: 0.15em; }
    @media print { body { padding: 12px; } }
  </style>
  </head><body>
  ${!isPaid ? `<div class="unpaid-stamp">UNPAID</div>` : ''}
  ${bodyEl.innerHTML}
  <script>window.onload = function(){ window.print(); }<\/script>
  </body></html>`);
  win.document.close();
}

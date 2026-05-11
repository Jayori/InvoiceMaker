// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPhone(ccId, phoneId) {
  const raw = document.getElementById(phoneId).value.trim();
  if (!raw) return '';
  const cc = (document.getElementById(ccId)?.value || '+1').replace('-CA', ''); // +1-CA → +1
  const digits = raw.replace(/\D/g, '');
  return cc + digits;
}

// Normalize any phone input to E.164 (+1XXXXXXXXXX for US)
function normalizePhone(raw) {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (digits.length >= 10) return '+' + digits;
  return '';
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
      sessionStorage.setItem('mgr_pin', pin);
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
  handleSchedulerPrefill();
}

function handleSchedulerPrefill() {
  const params = new URLSearchParams(window.location.search);
  if (!params.get('prefill')) return;
  window.history.replaceState({}, '', window.location.pathname);
  const tab = params.get('tab') || 'new-invoice';
  const clientName  = params.get('client_name') || '';
  const clientEmail = params.get('client_email') || '';
  const clientPhone = params.get('client_phone') || '';
  const scAmount    = params.get('sc_amount') || '';
  const scDesc      = params.get('sc_desc') || 'Service Call';
  // Navigate to target tab
  setTimeout(() => {
    showTab(tab);
    if (tab === 'new-invoice') {
      // Set primary client from URL params
      if (clientName && clientEmail) {
        _primaryClient = { name: clientName, email: clientEmail.toLowerCase(), phone: clientPhone || '', company: '', address: '', city: '', state: '', zip: '' };
        _addingCoClient = false;
        renderInvClientSection();
      }
      // Pre-fill service call as first line item if present
      if (scAmount) {
        addItem(scDesc, 'service', 1, scAmount);
      }
    } else if (tab === 'new-estimate') {
      if (clientName && clientEmail) {
        _primaryEstClient = { name: clientName, email: clientEmail.toLowerCase(), phone: clientPhone || '', company: '', address: '', city: '', state: '', zip: '', addresses: [] };
        _estAddrIdx = -1;
        renderEstClientSection();
      }
      if (scAmount) {
        const itemsWrap = document.getElementById('est-items');
        if (itemsWrap) {
          const rows = itemsWrap.querySelectorAll('.item-row');
          if (rows.length > 0) {
            const descEl = rows[0].querySelector('.item-desc'); if (descEl) descEl.value = scDesc;
            const priceEl = rows[0].querySelector('.item-price'); if (priceEl) priceEl.value = scAmount;
            const qtyEl = rows[0].querySelector('.item-qty'); if (qtyEl) qtyEl.value = '1';
          }
        }
      }
    }
  }, 200);
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
  if (name === 'new-invoice') renderInvClientSection();
  if (name === 'new-estimate') renderEstClientSection();
  if (name === 'schedule') loadSchedule();
  if (name === 'settings') { loadBusinessProfiles(); loadGcalStatus(); handleGcalRedirect(); }
  if (name === 'analytics') buildAnalytics();
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
        <td><div class="client-name" style="cursor:pointer;text-decoration:underline;text-underline-offset:2px;text-decoration-color:var(--gray-300);" onclick="event.stopPropagation();openClientModalByEmail('${escAttr(inv.client_name)}','${escAttr(inv.client_email||'')}')" title="View client">${esc(inv.client_name)}${(inv.co_clients||[]).length ? `<span style="font-size:11px;color:var(--gray-400);margin-left:4px;">+${inv.co_clients.length} other${inv.co_clients.length>1?'s':''}</span>` : ''}</div><div class="invoice-num">${esc(inv.client_email)}</div></td>
        <td>${esc(inv.invoice_number)}</td>
        <td onclick="event.stopPropagation();copyCode('${escAttr(inv.passcode||'')}',this)" title="Click to copy" style="cursor:pointer;"><code style="font-size:13px;letter-spacing:0.1em;background:var(--gray-100);padding:2px 6px;border-radius:4px;">${esc(inv.passcode || '—')}</code></td>
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
    buildMiniWidget();
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

// ─── Invoice client card UI ────────────────────────────────────────────────────

let _primaryClient = null;  // { name, email, phone, company, address, city, state, zip, addresses }
let _coClients = [];        // [{ name, email, phone }]
let _addingCoClient = false;
let _invAddrIdx = 0;        // index of selected saved address in picker; -1 = new/custom

function _ccOpts() {
  return '<option value="+1">+1 US</option><option value="+1-CA">+1 CA</option><option value="+44">+44 UK</option><option value="+52">+52 MX</option><option value="+61">+61 AU</option><option value="+91">+91 IN</option><option value="+49">+49 DE</option><option value="+33">+33 FR</option><option value="+55">+55 BR</option><option value="+34">+34 ES</option><option value="+39">+39 IT</option><option value="+81">+81 JP</option><option value="+86">+86 CN</option>';
}

function renderInvClientSection() {
  const sec = document.getElementById('inv-client-section');
  if (!sec) return;
  sec.innerHTML = _primaryClient ? _buildInvClientCards() : _buildInvClientSelector();
  setTimeout(function() {
    initAddressAutocomplete('inv-new-address', 'inv-new-city', 'inv-new-state', 'inv-new-zip');
    initAddressAutocomplete('inv-nc-address', 'inv-nc-city', 'inv-nc-state', 'inv-nc-zip');
  }, 0);
}

function _buildInvClientSelector() {
  const options = clientsCache.map(c =>
    '<option value="' + escAttr(c.email) + '">' + esc(c.name) + (c.company ? ' (' + esc(c.company) + ')' : '') + (c.email ? ' \u2014 ' + esc(c.email) : '') + '</option>'
  ).join('');
  return (
    '<div style="margin-bottom:12px;">' +
      '<label style="font-size:13px;font-weight:500;color:var(--gray-700);display:block;margin-bottom:6px;">Saved Client</label>' +
      '<select onchange="invPickSavedClient(this.value)" style="width:100%;">' +
        '<option value="">— Select a saved client —</option>' + options +
      '</select>' +
    '</div>' +
    '<div class="inv-selector-or">or enter new client</div>' +
    '<div class="inv-client-input-form">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">' +
        '<input type="text" id="inv-nc-name" placeholder="Name *" style="font-size:14px;">' +
        '<input type="email" id="inv-nc-email" placeholder="Email *" style="font-size:14px;">' +
        '<div style="display:flex;gap:6px;">' +
          '<select id="inv-nc-phone-cc" style="font-size:13px;width:80px;flex-shrink:0;">' + _ccOpts() + '</select>' +
          '<input type="text" id="inv-nc-phone" placeholder="(XXX) XXX-XXXX" style="font-size:14px;flex:1;">' +
        '</div>' +
        '<input type="text" id="inv-nc-company" placeholder="Company" style="font-size:14px;">' +
      '</div>' +
      '<div id="inv-nc-addr-wrap" style="display:none;margin-bottom:8px;">' +
        '<input type="text" id="inv-nc-address" placeholder="Street Address" style="font-size:14px;width:100%;margin-bottom:6px;">' +
        '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;">' +
          '<input type="text" id="inv-nc-city" placeholder="City" style="font-size:14px;">' +
          '<input type="text" id="inv-nc-state" placeholder="ST" style="font-size:14px;">' +
          '<input type="text" id="inv-nc-zip" placeholder="ZIP" style="font-size:14px;">' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;">' +
        '<button type="button" onclick="invConfirmNewClient()" class="btn btn-primary" style="flex:1;justify-content:center;">Confirm Client</button>' +
        '<button type="button" onclick="invToggleAddr()" id="inv-addr-toggle" style="background:none;border:none;color:var(--gray-400);cursor:pointer;font-size:13px;white-space:nowrap;">+ Address</button>' +
      '</div>' +
    '</div>'
  );
}

function _getClientAddresses(client) {
  const saved = Array.isArray(client.addresses) ? client.addresses : [];
  if (!client.address) return saved;
  const legacyKey = [client.address, client.city, client.state, client.zip].join('|').toLowerCase();
  const alreadyIn = saved.some(function(a) { return [a.address, a.city, a.state, a.zip].join('|').toLowerCase() === legacyKey; });
  return alreadyIn ? saved : [{ address: client.address, city: client.city || '', state: client.state || '', zip: client.zip || '' }].concat(saved);
}

function invOnAddressSelect(val) {
  const fields = document.getElementById('inv-addr-fields');
  if (val === 'new') {
    _invAddrIdx = -1;
    if (fields) fields.style.display = '';
    setTimeout(function() { initAddressAutocomplete('inv-new-address', 'inv-new-city', 'inv-new-state', 'inv-new-zip'); }, 0);
  } else {
    _invAddrIdx = parseInt(val) || 0;
    if (fields) fields.style.display = 'none';
  }
}

async function _saveClientAddress(email, address, city, state, zip) {
  try {
    await fetch('/api/save-client-address', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, address, city, state, zip }),
    });
    await loadClients();
  } catch(e) { /* silent */ }
}

function estOnAddressSelect(val, client) {
  const email = ((document.getElementById('est-client-email') || {}).value || '').toLowerCase();
  const c = client || clientsCache.find(function(x) { return (x.email || '').toLowerCase() === email; });
  if (val === 'new') {
    ['est-client-address','est-client-city','est-client-state','est-client-zip'].forEach(function(id) {
      const el = document.getElementById(id); if (el) el.value = '';
    });
  } else if (c) {
    const a = _getClientAddresses(c)[parseInt(val)] || {};
    document.getElementById('est-client-address').value = a.address || '';
    document.getElementById('est-client-city').value = a.city || '';
    document.getElementById('est-client-state').value = a.state || '';
    document.getElementById('est-client-zip').value = a.zip || '';
  }
}

function _buildInvClientCards() {
  const c = _primaryClient;
  const initials = (c.name || '?').split(' ').map(function(w){return w[0]||'';}).join('').toUpperCase().slice(0, 2) || '?';
  const subLine = [c.email, c.phone, c.company].filter(Boolean).join(' \u00b7 ');

  let coHtml = _coClients.map(function(cc, i) {
    const ccInit = (cc.name || cc.email || '?').split(' ').map(function(w){return w[0]||'';}).join('').toUpperCase().slice(0, 2) || '?';
    const ccSub = [cc.email, cc.phone].filter(Boolean).join(' \u00b7 ');
    return (
      '<div class="inv-client-card">' +
        '<div class="cc-avatar" style="background:#d1fae5;color:#065f46;">' + ccInit + '</div>' +
        '<div class="cc-info">' +
          '<div class="cc-name">' + esc(cc.name || cc.email) + '</div>' +
          '<div class="cc-sub">' + esc(ccSub) + '</div>' +
        '</div>' +
        '<button type="button" class="cc-remove" onclick="invRemoveCoClient(' + i + ')" title="Remove">&#x2715;</button>' +
      '</div>'
    );
  }).join('');

  let addCoHtml = '';
  if (_addingCoClient) {
    const savedOpts = clientsCache
      .filter(function(sc){ return sc.email !== c.email && !_coClients.some(function(cc){return cc.email === sc.email;}); })
      .map(function(sc){ return '<option value="' + escAttr(sc.email) + '">' + esc(sc.name) + (sc.email ? ' \u2014 ' + esc(sc.email) : '') + '</option>'; })
      .join('');
    addCoHtml = (
      '<div class="inv-client-input-form" id="inv-co-input">' +
        '<div style="font-size:12px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">Add Co-Client</div>' +
        (savedOpts
          ? '<select onchange="invPickSavedCoClient(this.value)" style="width:100%;margin-bottom:10px;">' +
              '<option value="">— Select saved client —</option>' + savedOpts +
            '</select>' +
            '<div class="inv-selector-or">or type below</div>'
          : '') +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">' +
          '<input type="text" id="inv-cc-name" placeholder="Name" style="font-size:14px;">' +
          '<input type="email" id="inv-cc-email" placeholder="Email *" style="font-size:14px;">' +
        '</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button type="button" onclick="invConfirmCoClient()" class="btn btn-primary" style="flex:1;justify-content:center;font-size:13px;padding:8px;">Confirm</button>' +
          '<button type="button" onclick="invCancelCoClient()" style="background:var(--gray-100);border:none;border-radius:6px;cursor:pointer;padding:8px 14px;font-size:13px;color:var(--gray-700);">Cancel</button>' +
        '</div>' +
      '</div>'
    );
  } else {
    addCoHtml = '<button type="button" class="inv-add-co-btn" onclick="invStartAddCoClient()"><span style="font-size:20px;line-height:1;">+</span><span>Add Co-Client</span></button>';
  }

  // Build address picker
  const allAddrs = _getClientAddresses(c);
  let addrPickerHtml;
  if (allAddrs.length > 0) {
    const opts = allAddrs.map(function(a, i) {
      const label = [a.address, a.city, a.state, a.zip].filter(Boolean).join(', ');
      return '<option value="' + i + '"' + (_invAddrIdx === i ? ' selected' : '') + '>' + escAttr(label) + '</option>';
    }).join('');
    addrPickerHtml = (
      '<div class="inv-addr-section">' +
        '<div class="inv-addr-label">Job Address</div>' +
        '<select id="inv-addr-select" onchange="invOnAddressSelect(this.value)" style="width:100%;margin-bottom:6px;">' +
          opts +
          '<option value="new"' + (_invAddrIdx === -1 ? ' selected' : '') + '>+ Add new address</option>' +
        '</select>' +
        '<div id="inv-addr-fields" style="display:' + (_invAddrIdx === -1 ? '' : 'none') + ';margin-top:4px;">' +
          '<input type="text" id="inv-new-address" placeholder="Street Address" style="width:100%;margin-bottom:6px;font-size:14px;">' +
          '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:6px;">' +
            '<input type="text" id="inv-new-city" placeholder="City" style="font-size:14px;">' +
            '<input type="text" id="inv-new-state" placeholder="ST" style="font-size:14px;">' +
            '<input type="text" id="inv-new-zip" placeholder="ZIP" style="font-size:14px;">' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  } else {
    addrPickerHtml = (
      '<div class="inv-addr-section">' +
        '<div class="inv-addr-label">Job Address <span class="inv-addr-opt">(optional)</span></div>' +
        '<input type="text" id="inv-new-address" value="' + escAttr(c.address || '') + '" placeholder="Street Address" style="width:100%;margin-bottom:6px;font-size:14px;">' +
        '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:6px;">' +
          '<input type="text" id="inv-new-city" value="' + escAttr(c.city || '') + '" placeholder="City" style="font-size:14px;">' +
          '<input type="text" id="inv-new-state" value="' + escAttr(c.state || '') + '" placeholder="ST" style="font-size:14px;">' +
          '<input type="text" id="inv-new-zip" value="' + escAttr(c.zip || '') + '" placeholder="ZIP" style="font-size:14px;">' +
        '</div>' +
      '</div>'
    );
  }

  return (
    '<div class="inv-client-card primary-card">' +
      '<div class="cc-avatar">' + initials + '</div>' +
      '<div class="cc-info">' +
        '<div class="cc-name">' + esc(c.name) + '</div>' +
        '<div class="cc-sub">' + esc(subLine) + '</div>' +
      '</div>' +
      '<button type="button" class="cc-remove" onclick="invRemovePrimaryClient()" title="Change client">&#x2715;</button>' +
    '</div>' +
    coHtml +
    addCoHtml +
    addrPickerHtml
  );
}

function invPickSavedClient(email) {
  if (!email) return;
  const c = clientsCache.find(function(cl){ return cl.email === email; });
  if (!c) return;
  _primaryClient = { name: c.name || '', email: c.email || '', phone: c.phone || '', company: c.company || '', address: c.address || '', city: c.city || '', state: c.state || '', zip: c.zip || '', addresses: c.addresses || [] };
  _invAddrIdx = _getClientAddresses(_primaryClient).length > 0 ? 0 : -1;
  _addingCoClient = false;
  renderInvClientSection();
}

function invConfirmNewClient() {
  const name = (document.getElementById('inv-nc-name') || {}).value || '';
  const email = (document.getElementById('inv-nc-email') || {}).value || '';
  if (!name.trim() || !email.trim()) { showToast('Name and email are required.', 'error'); return; }
  _primaryClient = {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: buildPhone('inv-nc-phone-cc', 'inv-nc-phone'),
    company: ((document.getElementById('inv-nc-company') || {}).value || '').trim(),
    address: ((document.getElementById('inv-nc-address') || {}).value || '').trim(),
    city: ((document.getElementById('inv-nc-city') || {}).value || '').trim(),
    state: ((document.getElementById('inv-nc-state') || {}).value || '').trim(),
    zip: ((document.getElementById('inv-nc-zip') || {}).value || '').trim(),
    addresses: [],
  };
  _invAddrIdx = -1;
  _addingCoClient = false;
  renderInvClientSection();
}

function invToggleAddr() {
  const wrap = document.getElementById('inv-nc-addr-wrap');
  const btn = document.getElementById('inv-addr-toggle');
  if (!wrap) return;
  const shown = wrap.style.display !== 'none';
  wrap.style.display = shown ? 'none' : '';
  if (btn) btn.textContent = shown ? '+ Address' : '\u2212 Address';
  if (!shown) setTimeout(function() { initAddressAutocomplete('inv-nc-address', 'inv-nc-city', 'inv-nc-state', 'inv-nc-zip'); }, 0);
}

function invRemovePrimaryClient() {
  _primaryClient = null;
  _coClients = [];
  _addingCoClient = false;
  renderInvClientSection();
}

function invStartAddCoClient() {
  _addingCoClient = true;
  renderInvClientSection();
  setTimeout(function() {
    const el = document.getElementById('inv-cc-email');
    if (el) el.focus();
  }, 50);
}

function invCancelCoClient() {
  _addingCoClient = false;
  renderInvClientSection();
}

function invPickSavedCoClient(email) {
  if (!email) return;
  const c = clientsCache.find(function(cl){ return cl.email === email; });
  if (!c) return;
  _coClients.push({ name: c.name || '', email: c.email || '', phone: c.phone || '' });
  _addingCoClient = false;
  renderInvClientSection();
}

function invConfirmCoClient() {
  const name = ((document.getElementById('inv-cc-name') || {}).value || '').trim();
  const email = ((document.getElementById('inv-cc-email') || {}).value || '').trim();
  if (!email) { showToast('Email is required for co-client.', 'error'); return; }
  _coClients.push({ name: name, email: email.toLowerCase(), phone: '' });
  _addingCoClient = false;
  renderInvClientSection();
}

function invRemoveCoClient(idx) {
  _coClients.splice(idx, 1);
  _addingCoClient = false;
  renderInvClientSection();
}

// ─── Submit invoice ────────────────────────────────────────────────────────────

async function submitInvoice(e) {
  e.preventDefault();
  const items = getItems();
  if (!items.length || items.some(i => !i.description || i.quantity <= 0)) {
    showToast('Please complete all line items.', 'error'); return;
  }

  if (!_primaryClient) {
    showToast('Please select or confirm a client first.', 'error'); return;
  }

  const useTax = document.getElementById('tax-toggle').checked;
  const taxRate = useTax ? (parseFloat(document.getElementById('tax-rate').value) || 0) : 0;

  const receiptPhotos = await collectPhotos('invoice-photos');

  const coClients = _coClients.filter(function(c){ return c.email; }).map(function(c){ return { name: c.name, email: c.email }; });

  // Resolve job address from picker
  const _addrSel = document.getElementById('inv-addr-select');
  let _jobAddr, _jobCity, _jobState, _jobZip;
  if (_addrSel && _addrSel.value !== 'new') {
    const _a = _getClientAddresses(_primaryClient)[parseInt(_addrSel.value)] || {};
    _jobAddr = _a.address || ''; _jobCity = _a.city || ''; _jobState = _a.state || ''; _jobZip = _a.zip || '';
  } else {
    _jobAddr = ((document.getElementById('inv-new-address') || {}).value || '').trim();
    _jobCity = ((document.getElementById('inv-new-city') || {}).value || '').trim();
    _jobState = ((document.getElementById('inv-new-state') || {}).value || '').trim();
    _jobZip = ((document.getElementById('inv-new-zip') || {}).value || '').trim();
  }

  const payload = {
    clientName: _primaryClient.name,
    clientEmail: _primaryClient.email,
    businessProfileId: document.getElementById('inv-business-select').value || null,
    clientPhone: normalizePhone(_primaryClient.phone),
    clientCompany: _primaryClient.company || '',
    clientAddress: _jobAddr,
    clientCity: _jobCity,
    clientState: _jobState,
    clientZip: _jobZip,
    items,
    taxRate,
    notes: document.getElementById('notes').value.trim(),
    dueDate: document.getElementById('due-date').value || null,
    sendEmail: document.getElementById('inv-send-email').checked,
    sendSmsNotification: document.getElementById('inv-send-sms').checked,
    receiptPhotos,
    coClients: coClients.length ? coClients : undefined,
    ...getInvSchedData(),
  };

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

    if (_jobAddr && (!_addrSel || _addrSel.value === 'new')) {
      _saveClientAddress(_primaryClient.email, _jobAddr, _jobCity, _jobState, _jobZip);
    }
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
  const notesEl = document.getElementById('notes');
  if (notesEl) notesEl.value = '';
  _primaryClient = null;
  _coClients = [];
  _addingCoClient = false;
  _invAddrIdx = 0;
  renderInvClientSection();
  recalcTotals();
}

// ─── Calendar ──────────────────────────────────────────────────────────────────

let calEvents = [];
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

async function loadSchedule() {
  try {
    const res = await fetch('/api/get-scheduled-events?upcoming=1');
    calEvents = await res.json();
  } catch { calEvents = []; }
  renderUpcoming();
  renderCalendarGrid();
}

// Keep old name as alias
function loadCalendar() { return loadSchedule(); }

function renderUpcoming() {
  const wrap = document.getElementById('upcoming-events');
  const empty = document.getElementById('upcoming-empty');
  if (!wrap) return;
  const now = new Date();
  const upcoming = calEvents.filter(e => new Date(e.scheduled_at) >= now).slice(0, 12);
  if (!upcoming.length) { wrap.style.display = 'none'; if (empty) empty.style.display = ''; return; }
  wrap.style.display = 'flex';
  if (empty) empty.style.display = 'none';
  wrap.innerHTML = upcoming.map(e => {
    const d = new Date(e.scheduled_at);
    const dateStr = d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
    const durMins = e.duration_mins || e.scheduled_duration;
    const dur = durMins ? ` &middot; ${durMins >= 60 ? (durMins/60)+'h' : durMins+'m'}` : '';
    const scBadge = e.service_call?.amount ? `<span style="font-size:11px;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:99px;font-weight:700;">$${Number(e.service_call.amount).toFixed(0)} fee</span>` : '';
    const typeLabel = e.type === 'invoice' ? 'Invoice' : e.type === 'estimate' ? 'Estimate' : 'Event';
    const typeClass = e.type === 'invoice' ? 'type-invoice' : e.type === 'estimate' ? 'type-estimate' : 'type-event';
    const clickable = e.type === 'event';
    return `<div class="upcoming-event-card${clickable ? ' upcoming-event-card-clickable' : ''}" ${clickable ? `onclick="openEventDetail('${e.id}')"` : ''}>
      <div class="upcoming-event-date">${dateStr} &middot; ${timeStr}${dur}</div>
      <div class="upcoming-event-client">${esc(e.client_name)}</div>
      ${e.notes ? `<div style="font-size:12px;color:var(--gray-400);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(e.notes)}</div>` : ''}
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center;">
        <span class="upcoming-event-type ${typeClass}">${typeLabel}</span>
        ${scBadge}
      </div>
    </div>`;
  }).join('');
}

function renderCalendarGrid() {
  const titleEl = document.getElementById('cal-month-title');
  const grid = document.getElementById('cal-grid');
  if (!titleEl || !grid) return;

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  titleEl.textContent = `${monthNames[calMonth]} ${calYear}`;

  const today = new Date();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrev = new Date(calYear, calMonth, 0).getDate();

  // Build event map: dateStr → events[]
  const eventMap = {};
  calEvents.forEach(e => {
    const d = new Date(e.scheduled_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!eventMap[key]) eventMap[key] = [];
    eventMap[key].push(e);
  });

  let cells = '';
  // Prev month filler
  for (let i = firstDay - 1; i >= 0; i--) {
    cells += `<div class="cal-day cal-other-month"><span class="cal-day-num">${daysInPrev - i}</span></div>`;
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${calYear}-${calMonth}-${d}`;
    const dayEvents = eventMap[key] || [];
    const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d;
    const hasEvents = dayEvents.length > 0;
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dots = dayEvents.map(e => `<div class="cal-dot ${e.type === 'estimate' ? 'dot-estimate' : e.type === 'event' ? 'dot-event' : ''}"></div>`).join('');
    cells += `<div class="cal-day${isToday ? ' cal-today' : ''}${hasEvents ? ' cal-has-events' : ''}" onclick="showCalDay('${dateStr}')">
      <span class="cal-day-num">${d}</span>
      ${hasEvents ? `<div class="cal-dots">${dots}</div>` : ''}
    </div>`;
  }
  // Next month filler
  const total = firstDay + daysInMonth;
  const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= remaining; d++) {
    cells += `<div class="cal-day cal-other-month"><span class="cal-day-num">${d}</span></div>`;
  }
  grid.innerHTML = cells;
}

function calNav(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  document.getElementById('cal-day-detail').style.display = 'none';
  renderCalendarGrid();
}

function showCalDay(dateStr) {
  const detail = document.getElementById('cal-day-detail');
  if (!detail) return;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dayEvents = calEvents.filter(e => {
    const ev = new Date(e.scheduled_at);
    return ev.getFullYear() === y && ev.getMonth() === m - 1 && ev.getDate() === d;
  });
  // Highlight selected day
  document.querySelectorAll('.cal-day').forEach(el => el.classList.remove('cal-selected'));
  event?.target?.closest('.cal-day')?.classList.add('cal-selected');

  if (!dayEvents.length) { detail.style.display = 'none'; return; }
  const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
  detail.style.display = '';
  detail.innerHTML = `<div style="font-size:13px;font-weight:700;color:var(--gray-700);margin-bottom:10px;">${label}</div>` +
    dayEvents.map(e => {
      const t = new Date(e.scheduled_at).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
      const durMins = e.duration_mins || e.scheduled_duration;
      const dur = durMins ? ` &middot; ${durMins} min` : '';
      const isEvent = e.type === 'event';
      const typeClass = e.type === 'invoice' ? 'type-invoice' : e.type === 'estimate' ? 'type-estimate' : 'type-event';
      const typeLabel = e.type === 'invoice' ? 'Invoice' : e.type === 'estimate' ? 'Estimate' : 'Event';
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--gray-100);${isEvent ? 'cursor:pointer;' : ''}" ${isEvent ? `onclick="openEventDetail('${e.id}')"` : ''}>
        <div style="flex:1;">
          <div style="font-weight:600;color:var(--gray-900);">${esc(e.client_name)}</div>
          <div style="font-size:12px;color:var(--gray-500);">${t}${dur}</div>
        </div>
        <span class="upcoming-event-type ${typeClass}">${typeLabel}</span>
        ${isEvent ? '<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color:var(--gray-300);flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>' : ''}
      </div>`;
    }).join('');
}

// ─── Clients ───────────────────────────────────────────────────────────────────

let clientsCache = [];
let clientViewMode = 'card';
let activeClientId = null;

// Avatar color based on name
function clientAvatarColor(name) {
  const colors = ['#1a56db','#0f766e','#7c3aed','#db2777','#d97706','#059669','#dc2626','#2563eb'];
  let hash = 0;
  for (const ch of (name || '')) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function clientInitials(name) {
  const parts = (name || '').trim().split(' ');
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

function setClientView(mode) {
  clientViewMode = mode;
  document.getElementById('client-view-card-btn').classList.toggle('client-view-active', mode === 'card');
  document.getElementById('client-view-list-btn').classList.toggle('client-view-active', mode === 'list');
  const grid = document.getElementById('clients-card-grid');
  const table = document.getElementById('clients-table');
  if (!clientsCache.length) return;
  if (mode === 'card') { if (grid) grid.style.display = ''; if (table) table.style.display = 'none'; }
  else { if (grid) grid.style.display = 'none'; if (table) table.style.display = ''; }
}

// ─── Client action modal ───────────────────────────────────────────────────────

let prevTab = 'clients';
let activeClientEmail = '';

function openClientModal(id) {
  const c = clientsCache.find(x => x.id === id);
  if (!c) return;
  activeClientId = id;
  activeClientEmail = c.email || '';
  const color = clientAvatarColor(c.name);
  const initials = clientInitials(c.name).toUpperCase();
  const avatar = document.getElementById('cm-avatar');
  avatar.style.background = color;
  avatar.textContent = initials;
  document.getElementById('cm-name').textContent = c.name;
  document.getElementById('cm-meta').textContent = [c.company, c.email, c.phone].filter(Boolean).join(' · ');
  const overlay = document.getElementById('client-modal-overlay');
  overlay.style.display = 'flex';
}

function openClientModalByEmail(name, email) {
  const c = clientsCache.find(x => x.email?.toLowerCase() === email?.toLowerCase());
  if (c) { openClientModal(c.id); return; }
  // Client exists in invoices/estimates but not saved — show modal with limited options
  activeClientId = null;
  activeClientEmail = email || '';
  const color = clientAvatarColor(name);
  const initials = clientInitials(name).toUpperCase();
  const avatar = document.getElementById('cm-avatar');
  avatar.style.background = color;
  avatar.textContent = initials;
  document.getElementById('cm-name').textContent = name;
  document.getElementById('cm-meta').textContent = email || '';
  document.getElementById('client-modal-overlay').style.display = 'flex';
}

function closeClientModal() {
  document.getElementById('client-modal-overlay').style.display = 'none';
}

function cmSchedule() {
  const c = activeClientId ? clientsCache.find(x => x.id === activeClientId) : null;
  closeClientModal();
  showTab('schedule');
  setTimeout(() => openSchedModal(c), 100);
}

function cmEstimate() {
  const c = activeClientId ? clientsCache.find(x => x.id === activeClientId) : null;
  closeClientModal();
  showTab('new-estimate');
  if (c) setTimeout(function() { estPickSavedClient(c.email); }, 50);
}

function cmInvoice() {
  const c = activeClientId ? clientsCache.find(x => x.id === activeClientId) : null;
  closeClientModal();
  showTab('new-invoice');
  if (c) {
    setTimeout(function() {
      _primaryClient = { name: c.name || '', email: c.email || '', phone: c.phone || '', company: c.company || '', address: c.address || '', city: c.city || '', state: c.state || '', zip: c.zip || '' };
      _addingCoClient = false;
      renderInvClientSection();
    }, 50);
  }
}

function cmViewProfile() {
  const c = activeClientId ? clientsCache.find(x => x.id === activeClientId) : null;
  const name = c?.name || document.getElementById('cm-name').textContent;
  const email = activeClientEmail;
  const id = c?.id || null;
  closeClientModal();
  showClientProfile(email, name, id);
}

// ─── Client profile dashboard ──────────────────────────────────────────────────

function showClientProfile(email, name, clientId) {
  // remember origin tab
  const active = document.querySelector('.mgr-tab:not([style*="display:none"])');
  if (active) prevTab = active.id.replace('tab-', '');

  showTab('client-profile');

  const c = (clientId && clientsCache.find(x => x.id === clientId)) || { name, email };
  const color = clientAvatarColor(c.name);
  const initials = clientInitials(c.name).toUpperCase();

  const avatar = document.getElementById('cp-avatar');
  avatar.style.background = color;
  avatar.textContent = initials;
  document.getElementById('cp-name').textContent = c.name;
  document.getElementById('cp-meta').textContent = [c.company, c.email, c.phone].filter(Boolean).join(' · ');

  const codeWrap = document.getElementById('cp-code-wrap');
  if (c.passcode) {
    codeWrap.innerHTML = `<span style="font-size:12px;color:var(--gray-500);">Access Code:</span>
      <code onclick="copyCode('${escAttr(c.passcode)}',this)" style="font-size:14px;letter-spacing:0.12em;background:var(--gray-100);padding:3px 10px;border-radius:6px;cursor:pointer;font-family:monospace;" title="Click to copy">${esc(c.passcode)}</code>`;
  } else {
    codeWrap.innerHTML = '';
  }

  const emailLower = (email || '').toLowerCase();
  const clientInvoices = invoicesCache.filter(i => i.client_email?.toLowerCase() === emailLower);
  const clientEstimates = estimatesCache.filter(e => e.client_email?.toLowerCase() === emailLower);

  const totalBilled = clientInvoices.reduce((s, i) => s + Number(i.total || 0), 0);
  const paid = clientInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total || 0), 0);
  const outstanding = totalBilled - paid;

  document.getElementById('cp-stats').innerHTML = `
    <div class="stat-card"><div class="stat-value">$${totalBilled.toFixed(2)}</div><div class="stat-label">Total Billed</div></div>
    <div class="stat-card"><div class="stat-value" style="color:#166534;">$${paid.toFixed(2)}</div><div class="stat-label">Paid</div></div>
    <div class="stat-card"><div class="stat-value" style="color:#dc2626;">$${outstanding.toFixed(2)}</div><div class="stat-label">Outstanding</div></div>
    <div class="stat-card"><div class="stat-value">${clientEstimates.length}</div><div class="stat-label">Estimates</div></div>
    <div class="stat-card"><div class="stat-value">${clientInvoices.length}</div><div class="stat-label">Invoices</div></div>
  `;

  const now = new Date();
  const upcoming = [
    ...clientInvoices.filter(i => i.scheduled_at && new Date(i.scheduled_at) > now).map(i => ({ ...i, docType: 'invoice', label: i.invoice_number })),
    ...clientEstimates.filter(e => e.scheduled_at && new Date(e.scheduled_at) > now).map(e => ({ ...e, docType: 'estimate', label: e.estimate_number })),
  ].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  const upcomingEl = document.getElementById('cp-upcoming');
  upcomingEl.innerHTML = upcoming.length
    ? upcoming.map(ev => `
        <div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid var(--gray-100);">
          <div style="min-width:80px;font-size:12px;font-weight:700;color:var(--gray-500);">${formatDate(ev.scheduled_at)}</div>
          <div style="flex:1;font-size:14px;font-weight:600;color:var(--gray-900);">${esc(ev.label)}</div>
          <div style="font-size:14px;color:var(--gray-700);">$${Number(ev.total).toFixed(2)}</div>
          <span class="upcoming-event-type type-${ev.docType}">${ev.docType}</span>
        </div>`).join('')
    : '<div style="color:var(--gray-400);font-size:13px;padding:12px 0;">No upcoming scheduled jobs.</div>';

  const invEl = document.getElementById('cp-invoices');
  invEl.innerHTML = clientInvoices.length
    ? `<table class="invoice-table" style="margin-top:6px;">
        <thead><tr><th>Invoice #</th><th>Passcode</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>${clientInvoices.map(inv => `
          <tr onclick="previewInvoice('${inv.id}')" style="cursor:pointer;">
            <td>${esc(inv.invoice_number)}</td>
            <td onclick="copyCode('${escAttr(inv.passcode||'')}',this);event.stopPropagation();" style="cursor:pointer;" title="Click to copy"><code style="font-size:12px;letter-spacing:0.1em;background:var(--gray-100);padding:2px 6px;border-radius:4px;">${esc(inv.passcode || '—')}</code></td>
            <td>${formatDate(inv.created_at)}</td>
            <td class="amount">$${Number(inv.total).toFixed(2)}</td>
            <td><span class="badge badge-${inv.status}">${capitalize(inv.status)}</span></td>
          </tr>`).join('')}
        </tbody></table>`
    : '<div style="color:var(--gray-400);font-size:13px;padding:12px 0;">No invoices yet.</div>';

  const estEl = document.getElementById('cp-estimates');
  estEl.innerHTML = clientEstimates.length
    ? `<table class="invoice-table" style="margin-top:6px;">
        <thead><tr><th>Estimate #</th><th>Passcode</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>${clientEstimates.map(est => {
          const sc = est.status === 'approved' ? 'paid' : est.status === 'rejected' ? 'rejected' : 'pending';
          return `<tr onclick="previewEstimate('${est.id}')" style="cursor:pointer;">
            <td>${esc(est.estimate_number)}</td>
            <td onclick="copyCode('${escAttr(est.passcode||'')}',this);event.stopPropagation();" style="cursor:pointer;" title="Click to copy"><code style="font-size:12px;letter-spacing:0.1em;background:var(--gray-100);padding:2px 6px;border-radius:4px;">${esc(est.passcode || '—')}</code></td>
            <td>${formatDate(est.created_at)}</td>
            <td class="amount">$${Number(est.total).toFixed(2)}</td>
            <td><span class="badge badge-${sc}">${capitalize(est.status)}</span></td>
          </tr>`;
        }).join('')}
        </tbody></table>`
    : '<div style="color:var(--gray-400);font-size:13px;padding:12px 0;">No estimates yet.</div>';
}

function backFromProfile() {
  showTab(prevTab || 'clients');
}

// ─── Copy utility ──────────────────────────────────────────────────────────────

function copyCode(text, el) {
  if (!text || text === '—') return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Copy failed — try manually.', 'error');
  });
}

async function loadClients() {
  const loading = document.getElementById('clients-loading');
  const table = document.getElementById('clients-table');
  const empty = document.getElementById('clients-empty');
  const tbody = document.getElementById('clients-tbody');
  const grid = document.getElementById('clients-card-grid');

  if (loading) loading.style.display = '';
  if (table) table.style.display = 'none';
  if (grid) grid.style.display = 'none';
  if (empty) empty.style.display = 'none';

  try {
    const res = await fetch('/api/get-clients');
    clientsCache = await res.json();

    // Refresh invoice client selector (only if no client is currently selected)
    if (!_primaryClient) renderInvClientSection();
    populateEstimateClientDropdown();

    if (loading) loading.style.display = 'none';
    if (!clientsCache.length) { if (empty) empty.style.display = ''; return; }

    // Detect duplicates (same email)
    const emailGroups = {};
    clientsCache.forEach(c => {
      const key = (c.email || '').toLowerCase().trim();
      if (!emailGroups[key]) emailGroups[key] = [];
      emailGroups[key].push(c);
    });
    const dupGroups = Object.values(emailGroups).filter(g => g.length > 1);
    renderDupBanner(dupGroups);

    // Card view
    if (grid) {
      grid.innerHTML = clientsCache.map(c => {
        const color = clientAvatarColor(c.name);
        const initials = clientInitials(c.name).toUpperCase();
        const isDup = emailGroups[(c.email||'').toLowerCase().trim()]?.length > 1;
        return `<div class="client-card${isDup ? ' client-card-dup' : ''}" data-id="${c.id}" onclick="openClientModal('${c.id}')">
          ${isDup ? `<div class="dup-badge" title="Duplicate — click Merge to clean up">duplicate</div>` : ''}
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
            <div class="client-avatar" style="background:${color};">${esc(initials)}</div>
            <div>
              <div class="client-card-name">${esc(c.name)}</div>
              ${c.company ? `<div class="client-card-company">${esc(c.company)}</div>` : ''}
            </div>
          </div>
          ${c.email ? `<div class="client-card-detail"><svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>${esc(c.email)}</div>` : ''}
          ${c.phone ? `<div class="client-card-detail"><svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>${esc(c.phone)}</div>` : ''}
          ${c.passcode ? `<div class="client-card-detail" style="margin-top:6px;" onclick="event.stopPropagation();copyCode('${escAttr(c.passcode)}',this)" title="Click to copy access code"><svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg><code style="font-size:11px;letter-spacing:0.12em;background:var(--gray-100);padding:1px 5px;border-radius:4px;cursor:pointer;">${esc(c.passcode)}</code><svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="opacity:0.4;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg></div>` : ''}
          <div class="client-card-actions" onclick="event.stopPropagation()">
            <button class="btn btn-sm btn-secondary" onclick="editClient('${c.id}')">Edit</button>
            <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:none;" onclick="deleteClient('${c.id}')">Delete</button>
          </div>
        </div>`;
      }).join('');
    }

    // List view
    if (tbody) tbody.innerHTML = clientsCache.map(c => `
      <tr style="cursor:pointer;" onclick="openClientModal('${c.id}')">
        <td class="client-name" style="font-weight:600;">${esc(c.name)}</td>
        <td>${esc(c.email)}</td>
        <td>${esc(c.phone || '—')}</td>
        <td>${esc(c.company || '—')}</td>
        <td onclick="event.stopPropagation();copyCode('${escAttr(c.passcode||'')}',this)" title="Click to copy"><code style="font-size:13px;letter-spacing:0.1em;background:var(--gray-100);padding:2px 6px;border-radius:4px;cursor:pointer;">${esc(c.passcode || '—')}</code></td>
        <td style="display:flex;gap:8px;flex-wrap:wrap;" onclick="event.stopPropagation()">
          <button class="btn btn-sm btn-secondary" onclick="editClient('${c.id}')">Edit</button>
          <button class="btn btn-sm btn-secondary" onclick="regenClientCode('${c.id}', '${escAttr(c.name)}')">New Code</button>
          <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:none;" onclick="deleteClient('${c.id}')">Delete</button>
        </td>
      </tr>`).join('');

    setClientView(clientViewMode);
  } catch { if (loading) loading.textContent = 'Failed to load clients.'; }
}

function renderDupBanner(dupGroups) {
  let banner = document.getElementById('dup-merge-banner');
  if (!dupGroups.length) { if (banner) banner.remove(); return; }
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'dup-merge-banner';
    const grid = document.getElementById('clients-card-grid');
    grid?.parentNode?.insertBefore(banner, grid);
  }
  const totalDups = dupGroups.reduce((s, g) => s + g.length - 1, 0);
  banner.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:12px 16px;background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;margin-bottom:14px;">
    <span style="font-size:14px;color:#92400e;font-weight:600;">&#9888; ${totalDups} duplicate client record${totalDups > 1 ? 's' : ''} found — same email, multiple entries.</span>
    <button class="btn btn-sm" style="background:#f59e0b;color:#fff;border:none;font-weight:700;" onclick="mergeAllDuplicates()">Merge All Duplicates</button>
  </div>`;
}

async function mergeAllDuplicates() {
  if (!confirm('This will merge duplicate clients with the same email into one record, keeping the most complete entry. Continue?')) return;

  const emailGroups = {};
  clientsCache.forEach(c => {
    const key = (c.email || '').toLowerCase().trim();
    if (!emailGroups[key]) emailGroups[key] = [];
    emailGroups[key].push(c);
  });

  const dupGroups = Object.values(emailGroups).filter(g => g.length > 1);
  let deleted = 0;

  for (const group of dupGroups) {
    // Pick best record: prefer one with passcode, then most fields filled
    const score = c => (c.passcode ? 10 : 0) + [c.phone, c.company, c.address, c.notes].filter(Boolean).length;
    group.sort((a, b) => score(b) - score(a));
    const keep = group[0];
    const discard = group.slice(1);

    // Ensure the keeper has a passcode (copy from discards if needed)
    if (!keep.passcode) {
      const withCode = discard.find(c => c.passcode);
      if (withCode) {
        await fetch('/api/save-client', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: keep.id, passcode: withCode.passcode }),
        });
      }
    }

    for (const c of discard) {
      await fetch(`/api/delete-client`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id }),
      });
      deleted++;
    }
  }

  await loadClients();
  showToast(`Merged ${deleted} duplicate record${deleted !== 1 ? 's' : ''}.`, 'success');
}

function fillClient(id) {
  // Legacy: populate invoice client card from a client ID
  const c = clientsCache.find(x => x.id === id);
  if (!c) return;
  _primaryClient = { name: c.name || '', email: c.email || '', phone: c.phone || '', company: c.company || '', address: c.address || '', city: c.city || '', state: c.state || '', zip: c.zip || '' };
  _addingCoClient = false;
  renderInvClientSection();
}

// ─── Estimate client card UI ────────────────────────────────────────────────────

let _primaryEstClient = null;
let _estAddingCoClient = false;
let _estAddrIdx = 0;

function renderEstClientSection() {
  const sec = document.getElementById('est-client-section');
  if (!sec) return;
  sec.innerHTML = _primaryEstClient ? _buildEstClientCards() : _buildEstClientSelector();
  setTimeout(function() {
    initAddressAutocomplete('est-new-address', 'est-new-city', 'est-new-state', 'est-new-zip');
    initAddressAutocomplete('est-nc-address', 'est-nc-city', 'est-nc-state', 'est-nc-zip');
  }, 0);
}

function _buildEstClientSelector() {
  const options = clientsCache.map(function(c) {
    return '<option value="' + escAttr(c.email) + '">' + esc(c.name) + (c.company ? ' (' + esc(c.company) + ')' : '') + (c.email ? ' \u2014 ' + esc(c.email) : '') + '</option>';
  }).join('');
  return (
    (options
      ? '<div style="margin-bottom:12px;"><label style="font-size:13px;font-weight:500;color:var(--gray-700);display:block;margin-bottom:6px;">Saved Client</label>' +
          '<select onchange="estPickSavedClient(this.value)" style="width:100%;">' +
            '<option value="">— Select a saved client —</option>' + options +
          '</select></div>'
      : '') +
    '<div class="inv-selector-or">or enter new client</div>' +
    '<div class="inv-client-input-form">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">' +
        '<input type="text" id="est-nc-name" placeholder="Name *" style="font-size:14px;">' +
        '<input type="email" id="est-nc-email" placeholder="Email *" style="font-size:14px;">' +
        '<div style="display:flex;gap:6px;">' +
          '<select id="est-nc-phone-cc" style="font-size:13px;width:80px;flex-shrink:0;">' + _ccOpts() + '</select>' +
          '<input type="text" id="est-nc-phone" placeholder="(XXX) XXX-XXXX" style="font-size:14px;flex:1;">' +
        '</div>' +
        '<input type="text" id="est-nc-company" placeholder="Company" style="font-size:14px;">' +
      '</div>' +
      '<div id="est-nc-addr-wrap" style="display:none;margin-bottom:8px;">' +
        '<input type="text" id="est-nc-address" placeholder="Street Address" style="font-size:14px;width:100%;margin-bottom:6px;">' +
        '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;">' +
          '<input type="text" id="est-nc-city" placeholder="City" style="font-size:14px;">' +
          '<input type="text" id="est-nc-state" placeholder="ST" style="font-size:14px;">' +
          '<input type="text" id="est-nc-zip" placeholder="ZIP" style="font-size:14px;">' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;">' +
        '<button type="button" onclick="estConfirmNewClient()" class="btn btn-primary" style="flex:1;justify-content:center;">Confirm Client</button>' +
        '<button type="button" onclick="estToggleAddr()" id="est-addr-toggle" style="background:none;border:none;color:var(--gray-400);cursor:pointer;font-size:13px;white-space:nowrap;">+ Address</button>' +
      '</div>' +
    '</div>'
  );
}

function _buildEstClientCards() {
  const c = _primaryEstClient;
  const initials = (c.name || '?').split(' ').map(function(w){return w[0]||'';}).join('').toUpperCase().slice(0,2) || '?';
  const subLine = [c.email, c.phone, c.company].filter(Boolean).join(' \u00b7 ');

  const allAddrs = _getClientAddresses(c);
  let addrPickerHtml;
  if (allAddrs.length > 0) {
    const opts = allAddrs.map(function(a, i) {
      const label = [a.address, a.city, a.state, a.zip].filter(Boolean).join(', ');
      return '<option value="' + i + '"' + (_estAddrIdx === i ? ' selected' : '') + '>' + escAttr(label) + '</option>';
    }).join('');
    addrPickerHtml = (
      '<div class="inv-addr-section">' +
        '<div class="inv-addr-label">Job Address</div>' +
        '<select id="est-addr-select" onchange="estOnAddressSelectCard(this.value)" style="width:100%;margin-bottom:6px;">' +
          opts +
          '<option value="new"' + (_estAddrIdx === -1 ? ' selected' : '') + '>+ Add new address</option>' +
        '</select>' +
        '<div id="est-addr-fields" style="display:' + (_estAddrIdx === -1 ? '' : 'none') + ';margin-top:4px;">' +
          '<input type="text" id="est-new-address" placeholder="Street Address" style="width:100%;margin-bottom:6px;font-size:14px;">' +
          '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:6px;">' +
            '<input type="text" id="est-new-city" placeholder="City" style="font-size:14px;">' +
            '<input type="text" id="est-new-state" placeholder="ST" style="font-size:14px;">' +
            '<input type="text" id="est-new-zip" placeholder="ZIP" style="font-size:14px;">' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  } else {
    addrPickerHtml = (
      '<div class="inv-addr-section">' +
        '<div class="inv-addr-label">Job Address <span class="inv-addr-opt">(optional)</span></div>' +
        '<input type="text" id="est-new-address" value="' + escAttr(c.address || '') + '" placeholder="Street Address" style="width:100%;margin-bottom:6px;font-size:14px;">' +
        '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:6px;">' +
          '<input type="text" id="est-new-city" value="' + escAttr(c.city || '') + '" placeholder="City" style="font-size:14px;">' +
          '<input type="text" id="est-new-state" value="' + escAttr(c.state || '') + '" placeholder="ST" style="font-size:14px;">' +
          '<input type="text" id="est-new-zip" value="' + escAttr(c.zip || '') + '" placeholder="ZIP" style="font-size:14px;">' +
        '</div>' +
      '</div>'
    );
  }

  return (
    '<div class="inv-client-card primary-card">' +
      '<div class="cc-avatar">' + initials + '</div>' +
      '<div class="cc-info">' +
        '<div class="cc-name">' + esc(c.name) + '</div>' +
        '<div class="cc-sub">' + esc(subLine) + '</div>' +
      '</div>' +
      '<button type="button" class="cc-remove" onclick="estRemovePrimaryClient()" title="Change client">&#x2715;</button>' +
    '</div>' +
    addrPickerHtml
  );
}

function estPickSavedClient(email) {
  if (!email) return;
  const c = clientsCache.find(function(cl){ return cl.email === email; });
  if (!c) return;
  _primaryEstClient = { name: c.name || '', email: c.email || '', phone: c.phone || '', company: c.company || '', address: c.address || '', city: c.city || '', state: c.state || '', zip: c.zip || '', addresses: c.addresses || [] };
  _estAddrIdx = _getClientAddresses(_primaryEstClient).length > 0 ? 0 : -1;
  renderEstClientSection();
}

function estConfirmNewClient() {
  const name = ((document.getElementById('est-nc-name') || {}).value || '').trim();
  const email = ((document.getElementById('est-nc-email') || {}).value || '').trim();
  if (!name || !email) { showToast('Name and email are required.', 'error'); return; }
  _primaryEstClient = {
    name: name,
    email: email.toLowerCase(),
    phone: buildPhone('est-nc-phone-cc', 'est-nc-phone'),
    company: ((document.getElementById('est-nc-company') || {}).value || '').trim(),
    address: ((document.getElementById('est-nc-address') || {}).value || '').trim(),
    city: ((document.getElementById('est-nc-city') || {}).value || '').trim(),
    state: ((document.getElementById('est-nc-state') || {}).value || '').trim(),
    zip: ((document.getElementById('est-nc-zip') || {}).value || '').trim(),
    addresses: [],
  };
  _estAddrIdx = -1;
  renderEstClientSection();
}

function estToggleAddr() {
  const wrap = document.getElementById('est-nc-addr-wrap');
  const btn = document.getElementById('est-addr-toggle');
  if (!wrap) return;
  const shown = wrap.style.display !== 'none';
  wrap.style.display = shown ? 'none' : '';
  if (btn) btn.textContent = shown ? '+ Address' : '\u2212 Address';
  if (!shown) setTimeout(function() { initAddressAutocomplete('est-nc-address', 'est-nc-city', 'est-nc-state', 'est-nc-zip'); }, 0);
}

function estRemovePrimaryClient() {
  _primaryEstClient = null;
  _estAddrIdx = 0;
  renderEstClientSection();
}

function estOnAddressSelectCard(val) {
  const fields = document.getElementById('est-addr-fields');
  if (val === 'new') {
    _estAddrIdx = -1;
    if (fields) fields.style.display = '';
    setTimeout(function() { initAddressAutocomplete('est-new-address', 'est-new-city', 'est-new-state', 'est-new-zip'); }, 0);
  } else {
    _estAddrIdx = parseInt(val) || 0;
    if (fields) fields.style.display = 'none';
  }
}

// ─── Google Places Autocomplete ──────────────────────────────────────────────

let _mapsReady = false;
let _acPending = [];

window._onMapsLoaded = function() {
  _mapsReady = true;
  _acPending.forEach(function(fn) { fn(); });
  _acPending = [];
};

(async function loadMapsScript() {
  try {
    const res = await fetch('/api/get-maps-config');
    if (!res.ok) return;
    const cfg = await res.json();
    if (!cfg.googleMapsApiKey) return;
    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(cfg.googleMapsApiKey) + '&libraries=places&callback=_onMapsLoaded';
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  } catch(e) {}
})();

function initAddressAutocomplete(streetId, cityId, stateId, zipId) {
  function doInit() {
    const input = document.getElementById(streetId);
    if (!input || input._acInit) return;
    input._acInit = true;
    try {
      const ac = new google.maps.places.Autocomplete(input, { types: ['address'] });
      ac.addListener('place_changed', function() {
        const place = ac.getPlace();
        const comps = place.address_components || [];
        const get = function(type) { return (comps.find(function(c) { return c.types.includes(type); }) || {}).short_name || ''; };
        const getLong = function(type) { return (comps.find(function(c) { return c.types.includes(type); }) || {}).long_name || ''; };
        const street = [get('street_number'), getLong('route')].filter(Boolean).join(' ');
        if (street) input.value = street;
        if (cityId) { const el = document.getElementById(cityId); if (el) el.value = getLong('locality') || getLong('sublocality_level_1') || ''; }
        if (stateId) { const el = document.getElementById(stateId); if (el) el.value = get('administrative_area_level_1') || ''; }
        if (zipId) { const el = document.getElementById(zipId); if (el) el.value = get('postal_code') || ''; }
      });
    } catch(e) {}
  }
  if (_mapsReady && typeof google !== 'undefined') { doInit(); } else { _acPending.push(doInit); }
}

function fillEstimateClient(id) {
  const c = clientsCache.find(x => x.id === id);
  if (!c) return;
  document.getElementById('est-client-name').value = c.name || '';
  document.getElementById('est-client-email').value = c.email || '';
  document.getElementById('est-client-phone').value = c.phone || '';
  document.getElementById('est-client-company').value = c.company || '';
  const allAddrs = _getClientAddresses(c);
  const pickerWrap = document.getElementById('est-addr-picker-wrap');
  const addrSel = document.getElementById('est-addr-select');
  if (allAddrs.length > 0 && pickerWrap && addrSel) {
    addrSel.innerHTML = allAddrs.map(function(a, i) {
      const label = [a.address, a.city, a.state, a.zip].filter(Boolean).join(', ');
      return '<option value="' + i + '">' + esc(label) + '</option>';
    }).join('') + '<option value="new">+ Add new address</option>';
    pickerWrap.style.display = '';
    estOnAddressSelect('0', c);
  } else {
    if (pickerWrap) pickerWrap.style.display = 'none';
    document.getElementById('est-client-address').value = c.address || '';
    document.getElementById('est-client-city').value = c.city || '';
    document.getElementById('est-client-state').value = c.state || '';
    document.getElementById('est-client-zip').value = c.zip || '';
  }
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
    loadInvoices();
    loadEstimates();
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
  const isPartial = inv.status === 'partial';
  const amtPaidPreview = Number(inv.amount_paid || 0);
  const remainingPreview = (Number(inv.total) - amtPaidPreview).toFixed(2);
  const statusHtml = isPaid
    ? `<span class="inv-status-badge inv-status-paid">Paid</span>`
    : isPartial
      ? `<span class="inv-status-badge inv-status-partial">Partial &mdash; $${remainingPreview} remaining</span>`
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

  // Co-clients
  const coClientsHtml = (inv.co_clients || []).length
    ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--gray-100);">
        <div class="inv-label" style="margin-bottom:6px;">Also Billed To</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${(inv.co_clients || []).map(cc =>
            `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:99px;font-size:13px;color:#1e40af;">
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              ${esc(cc.name || cc.email)}
            </span>`
          ).join('')}
        </div>
       </div>`
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
    ${coClientsHtml}
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
        <td><div class="client-name" style="cursor:pointer;text-decoration:underline;text-underline-offset:2px;text-decoration-color:var(--gray-300);" onclick="event.stopPropagation();openClientModalByEmail('${escAttr(est.client_name)}','${escAttr(est.client_email||'')}')" title="View client">${esc(est.client_name)}</div><div class="invoice-num">${esc(est.client_email)}</div></td>
        <td>${esc(est.estimate_number)}</td>
        <td onclick="event.stopPropagation();copyCode('${escAttr(est.passcode||'')}',this)" title="Click to copy" style="cursor:pointer;"><code style="font-size:13px;letter-spacing:0.1em;background:var(--gray-100);padding:2px 6px;border-radius:4px;">${esc(est.passcode || '—')}</code></td>
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
            ${!clientsCache.some(c => c.email?.toLowerCase() === est.client_email?.toLowerCase()) ? `<button class="btn btn-sm btn-secondary" onclick="saveClientFromRow('${escAttr(est.client_name)}','${escAttr(est.client_email)}','${escAttr(est.client_phone||'')}','${escAttr(est.client_company||'')}','${escAttr(est.client_address||'')}','${escAttr(est.client_city||'')}','${escAttr(est.client_state||'')}','${escAttr(est.client_zip||'')}')" title="Save client to contacts">+ Client</button>` : ''}
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
  const allAddrs = _getClientAddresses(c);
  const pickerWrap = document.getElementById('est-addr-picker-wrap');
  const addrSel = document.getElementById('est-addr-select');
  if (allAddrs.length > 0 && pickerWrap && addrSel) {
    addrSel.innerHTML = allAddrs.map(function(a, i) {
      const label = [a.address, a.city, a.state, a.zip].filter(Boolean).join(', ');
      return '<option value="' + i + '">' + esc(label) + '</option>';
    }).join('') + '<option value="new">+ Add new address</option>';
    pickerWrap.style.display = '';
    estOnAddressSelect('0', c);
  } else {
    if (pickerWrap) pickerWrap.style.display = 'none';
    document.getElementById('est-client-address').value = c.address || '';
    document.getElementById('est-client-city').value = c.city || '';
    document.getElementById('est-client-state').value = c.state || '';
    document.getElementById('est-client-zip').value = c.zip || '';
  }
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
  if (!_primaryEstClient) { showToast('Please select or confirm a client first.', 'error'); return; }

  const useTax = document.getElementById('est-tax-toggle').checked;
  const taxRate = useTax ? (parseFloat(document.getElementById('est-tax-rate').value) || 0) : 0;

  const receiptPhotos = await collectPhotos('est-photos');

  const _estAddrSel = document.getElementById('est-addr-select');
  let _estJobAddr = '', _estJobCity = '', _estJobState = '', _estJobZip = '';
  if (_estAddrSel && _estAddrSel.value !== 'new') {
    const _ea = _getClientAddresses(_primaryEstClient)[parseInt(_estAddrSel.value)] || {};
    _estJobAddr = _ea.address || ''; _estJobCity = _ea.city || ''; _estJobState = _ea.state || ''; _estJobZip = _ea.zip || '';
  } else {
    _estJobAddr = ((document.getElementById('est-new-address') || {}).value || '').trim();
    _estJobCity = ((document.getElementById('est-new-city') || {}).value || '').trim();
    _estJobState = ((document.getElementById('est-new-state') || {}).value || '').trim();
    _estJobZip = ((document.getElementById('est-new-zip') || {}).value || '').trim();
  }

  const payload = {
    clientName: _primaryEstClient.name,
    clientEmail: _primaryEstClient.email,
    businessProfileId: document.getElementById('est-business-select').value || null,
    clientPhone: _primaryEstClient.phone || '',
    clientCompany: _primaryEstClient.company || '',
    clientAddress: _estJobAddr,
    clientCity: _estJobCity,
    clientState: _estJobState,
    clientZip: _estJobZip,
    items,
    taxRate,
    notes: document.getElementById('est-notes').value.trim(),
    sendEmail: document.getElementById('est-send-email').checked,
    sendSmsNotification: document.getElementById('est-send-sms').checked,
    receiptPhotos,
    depositAmount: parseFloat(document.getElementById('est-deposit').value) || null,
    ...getEstSchedData(),
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

    if (_estJobAddr && (!_estAddrSel || _estAddrSel.value === 'new')) {
      _saveClientAddress(_primaryEstClient.email, _estJobAddr, _estJobCity, _estJobState, _estJobZip);
    }
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
  setEstSchedMode('off');
  document.getElementById('estimate-form').reset();
  document.getElementById('est-items-tbody').innerHTML = '';
  estItemId = 0;
  document.getElementById('est-tax-input-wrap').style.display = 'none';
  document.getElementById('est-tax-row').style.display = 'none';
  document.getElementById('est-completion-display').style.display = 'none';
  const photoPreview = document.getElementById('est-photo-preview');
  if (photoPreview) photoPreview.innerHTML = '';
  const _estNotesEl = document.getElementById('est-notes');
  if (_estNotesEl) _estNotesEl.value = '';
  _primaryEstClient = null;
  _estAddrIdx = 0;
  renderEstClientSection();
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
  if (_currentPreviewType !== 'invoice') {
    // Estimate deposit — keep original simple confirm flow
    if (!confirm('Mark this deposit as paid?')) return;
    const btn = document.getElementById('mark-paid-btn');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      const res = await fetch('/api/mark-paid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: _currentPreviewId, type: 'estimate' }) });
      if (!res.ok) throw new Error('Failed');
      showToast('Marked as paid!', 'success');
      closePreviewModal(); loadInvoices(); loadEstimates();
    } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Mark as Paid'; }
    return;
  }
  openMarkPaidModal(_currentPreviewId, true);
}

function openMarkPaidModal(invId, fromPreview = false) {
  const inv = invoicesCache.find(i => i.id === invId);
  if (!inv) return;
  const total = Number(inv.total).toFixed(2);
  const amtPaid = Number(inv.amount_paid || 0);
  const remaining = (Number(inv.total) - amtPaid).toFixed(2);
  const hasPartial = inv.status === 'partial';

  const overlay = document.createElement('div');
  overlay.id = 'mpaid-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:600;display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.2);" onclick="event.stopPropagation()">
      <div style="padding:20px 24px 16px;border-bottom:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:17px;font-weight:700;color:#111827;">Record Payment</div>
          <div style="font-size:13px;color:#6b7280;margin-top:2px;">${esc(inv.invoice_number)} &mdash; $${total} total${hasPartial ? ` &middot; <span style="color:#1e40af;font-weight:600;">$${remaining} remaining</span>` : ''}</div>
        </div>
        <button onclick="closeMarkPaidModal()" style="background:var(--gray-100);border:none;cursor:pointer;width:30px;height:30px;border-radius:50%;font-size:16px;color:var(--gray-500);display:flex;align-items:center;justify-content:center;">&#x2715;</button>
      </div>
      <div style="padding:20px 24px;" id="mpaid-body">
        <div style="display:flex;gap:10px;">
          <button onclick="mpaidSelect('full')" class="btn btn-primary" style="flex:1;justify-content:center;">Full Payment</button>
          <button onclick="mpaidSelect('partial')" class="btn btn-secondary" style="flex:1;justify-content:center;">Partial Payment</button>
        </div>
      </div>
    </div>`;
  overlay.addEventListener('click', closeMarkPaidModal);
  document.body.appendChild(overlay);
  window._mpaidId = invId;
  window._mpaidFromPreview = fromPreview;
  window._mpaidRemaining = remaining;
}

function mpaidSelect(type) {
  const body = document.getElementById('mpaid-body');
  if (!body) return;
  if (type === 'full') {
    body.innerHTML = `
      <p style="font-size:14px;color:#374151;margin:0 0 16px;">Mark this invoice as <strong>fully paid</strong>?</p>
      <button id="mpaid-confirm-btn" onclick="submitMarkPaid('full')" class="btn btn-primary" style="width:100%;justify-content:center;">Confirm Full Payment</button>`;
  } else {
    body.innerHTML = `
      <div style="font-size:14px;color:#374151;margin-bottom:12px;">How much was paid?</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:16px;color:var(--gray-400);">$</span>
        <input type="number" id="mpaid-amount" placeholder="0.00" min="0.01" step="0.01"
          style="flex:1;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:16px;">
      </div>
      <div id="mpaid-err" style="color:#dc2626;font-size:12px;margin-top:6px;display:none;"></div>
      <button id="mpaid-confirm-btn" onclick="submitMarkPaid('partial')" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:14px;">Record Partial Payment</button>`;
    setTimeout(() => document.getElementById('mpaid-amount')?.focus(), 30);
  }
}

function closeMarkPaidModal() {
  document.getElementById('mpaid-overlay')?.remove();
  window._mpaidId = null;
}

async function submitMarkPaid(type) {
  const id = window._mpaidId;
  if (!id) return;
  const btn = document.getElementById('mpaid-confirm-btn');
  const errEl = document.getElementById('mpaid-err');

  let amount;
  if (type === 'partial') {
    amount = parseFloat(document.getElementById('mpaid-amount')?.value);
    if (!amount || amount <= 0) {
      if (errEl) { errEl.textContent = 'Please enter a valid amount.'; errEl.style.display = ''; }
      return;
    }
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  try {
    const body = { id, type: 'invoice' };
    if (amount !== undefined) body.amount = amount;
    const res = await fetch('/api/mark-paid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const resData = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(resData.error || `Server error ${res.status}`);
    closeMarkPaidModal();
    if (window._mpaidFromPreview) closePreviewModal();
    showToast(type === 'partial' ? 'Partial payment recorded!' : 'Invoice marked as paid!', 'success');
    loadInvoices();
  } catch (err) {
    showToast(err.message || 'Failed to record payment.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = type === 'partial' ? 'Record Partial Payment' : 'Confirm Full Payment'; }
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

function markInvoicePaidFromRow(id) {
  openMarkPaidModal(id, false);
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
    .inv-status-partial { background: #dbeafe; color: #1e40af; }
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

// ─── Analytics ─────────────────────────────────────────────────────────────────

const _chartInstances = {};
let _revenueRange = 12;

function _destroyChart(id) {
  if (_chartInstances[id]) { _chartInstances[id].destroy(); delete _chartInstances[id]; }
}

// Revenue value for an invoice — partial invoices contribute amount_paid, not total
function _invRevenue(inv) {
  return inv.status === 'partial' ? Number(inv.amount_paid || 0) : Number(inv.total || 0);
}

// Returns paid deposits as invoice-shaped objects for unified revenue calculations
function _paidDeposits() {
  return estimatesCache
    .filter(e => e.deposit_paid && Number(e.deposit_amount) > 0)
    .map(e => ({
      client_name: e.client_name,
      total: Number(e.deposit_amount),
      paid_at: e.created_at,
      created_at: e.created_at,
      _isDeposit: true,
    }));
}

function _fmt$(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function buildMiniWidget() {
  const allRevenue = [...invoicesCache.filter(i => i.status === 'paid' || i.status === 'partial'), ..._paidDeposits()];
  const now = new Date();
  const paidThisMonth = allRevenue.filter(i => {
    const d = new Date(i.paid_at || i.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const paidThisYear = allRevenue.filter(i => new Date(i.paid_at || i.created_at).getFullYear() === now.getFullYear());
  const outstanding = invoicesCache
    .filter(i => i.status === 'pending' || i.status === 'partial')
    .reduce((s, i) => s + (i.status === 'partial' ? Math.max(0, Number(i.total) - Number(i.amount_paid || 0)) : Number(i.total)), 0);

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('mini-stat-month', _fmt$(paidThisMonth.reduce((s, i) => s + _invRevenue(i), 0)));
  setEl('mini-stat-year', _fmt$(paidThisYear.reduce((s, i) => s + _invRevenue(i), 0)));
  setEl('mini-stat-outstanding', _fmt$(outstanding));

  const canvas = document.getElementById('mini-revenue-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const labels = [], data = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    labels.push(d.toLocaleString('default', { month: 'short' }));
    data.push(allRevenue.filter(i => {
      const p = new Date(i.paid_at || i.created_at);
      return p.getFullYear() === d.getFullYear() && p.getMonth() === d.getMonth();
    }).reduce((s, i) => s + _invRevenue(i), 0));
  }
  _destroyChart('mini');
  _chartInstances['mini'] = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: '#bfdbfe', borderRadius: 4 }] },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => _fmt$(ctx.raw) } } },
      scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { display: false } },
      responsive: true, maintainAspectRatio: true,
    }
  });
}

function buildAnalytics() {
  if (typeof Chart === 'undefined') return;
  const paidInvoices = invoicesCache.filter(i => i.status === 'paid' || i.status === 'partial');
  const paid = [...paidInvoices, ..._paidDeposits()]; // invoices + deposits
  const pending = invoicesCache.filter(i => i.status === 'pending' || i.status === 'partial');
  const now = new Date();
  const yr = now.getFullYear(), mo = now.getMonth();
  const q = Math.floor(mo / 3);
  const sum = arr => arr.reduce((s, i) => s + _invRevenue(i), 0);

  const paidMo = paid.filter(i => { const d = new Date(i.paid_at || i.created_at); return d.getFullYear() === yr && d.getMonth() === mo; });
  const paidQ  = paid.filter(i => { const d = new Date(i.paid_at || i.created_at); return d.getFullYear() === yr && Math.floor(d.getMonth()/3) === q; });
  const paidYr = paid.filter(i => new Date(i.paid_at || i.created_at).getFullYear() === yr);

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('stat-this-month',   _fmt$(sum(paidMo)));
  setEl('stat-this-quarter', _fmt$(sum(paidQ)));
  setEl('stat-this-year',    _fmt$(sum(paidYr)));
  setEl('stat-all-time',     _fmt$(sum(paid)));
  setEl('stat-outstanding',  _fmt$(sum(pending)));
  setEl('stat-avg-invoice',  paidInvoices.length ? _fmt$(sum(paidInvoices) / paidInvoices.length) : '$0');

  const keyEl = document.getElementById('analytics-key-stats');
  if (keyEl) {
    const clientMap = {};
    paid.forEach(i => { clientMap[i.client_name] = (clientMap[i.client_name] || 0) + Number(i.total); });
    const topClient = Object.entries(clientMap).sort((a,b) => b[1]-a[1])[0];
    const monthMap = {};
    paid.forEach(i => {
      const d = new Date(i.paid_at || i.created_at);
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
      monthMap[key] = (monthMap[key] || 0) + Number(i.total);
    });
    const topMonth = Object.entries(monthMap).sort((a,b) => b[1]-a[1])[0];
    const topMonthLabel = topMonth ? (() => {
      const parts = topMonth[0].split('-');
      return new Date(parts[0], parseInt(parts[1])-1, 1).toLocaleString('default',{month:'long',year:'numeric'});
    })() : '—';
    const collRate = invoicesCache.length ? Math.round(paidInvoices.length/invoicesCache.length*100) : 0;
    const estTotal = estimatesCache.length;
    const estApproved = estimatesCache.filter(e => e.status === 'approved').length;
    const convRate = estTotal ? Math.round(estApproved/estTotal*100) : 0;

    keyEl.innerHTML = [
      ['Best Client',          topClient ? topClient[0] + ' (' + _fmt$(topClient[1]) + ')' : '—'],
      ['Highest Invoice',      paid.length ? _fmt$(Math.max(...paid.map(i => Number(i.total)))) : '—'],
      ['Best Month',           topMonth ? topMonthLabel + ' — ' + _fmt$(topMonth[1]) : '—'],
      ['Collection Rate',      collRate + '% of invoices paid'],
      ['Estimate Close Rate',  convRate + '% (' + estApproved + ' / ' + estTotal + ' approved)'],
      ['Total Invoices Sent',  invoicesCache.length],
      ['Total Estimates Sent', estTotal],
    ].map(function(row) {
      return '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--gray-100);">' +
        '<span style="font-size:12px;color:var(--gray-500);">' + row[0] + '</span>' +
        '<span style="font-size:13px;font-weight:600;color:#111827;text-align:right;max-width:58%;">' + row[1] + '</span>' +
        '</div>';
    }).join('');
  }

  _buildLineChart();
  _buildBarChart(yr, paid);
  _buildDonutChart(paidInvoices, pending); // donut shows invoice statuses only
  _buildClientsChart(paid);
  _buildEstimatesChart();
}

function setRevenueRange(months) {
  _revenueRange = months;
  [6,12,24].forEach(function(n) {
    const btn = document.getElementById('range-' + n);
    if (btn) btn.className = n === months ? 'btn btn-sm' : 'btn btn-sm btn-secondary';
  });
  _buildLineChart();
}

function _buildLineChart() {
  const paid = [...invoicesCache.filter(i => i.status === 'paid' || i.status === 'partial'), ..._paidDeposits()];
  const now = new Date();
  const labels = [], data = [];
  for (let m = _revenueRange - 1; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const showYear = _revenueRange > 12;
    labels.push(d.toLocaleString('default', showYear ? { month: 'short', year: '2-digit' } : { month: 'short' }));
    data.push(paid.filter(i => {
      const p = new Date(i.paid_at || i.created_at);
      return p.getFullYear() === d.getFullYear() && p.getMonth() === d.getMonth();
    }).reduce((s, i) => s + _invRevenue(i), 0));
  }
  _destroyChart('line');
  const canvas = document.getElementById('analytics-line-chart');
  if (!canvas) return;
  _chartInstances['line'] = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Revenue', data, borderColor: '#1a56db', backgroundColor: 'rgba(26,86,219,0.08)', fill: true, tension: 0.4, pointBackgroundColor: '#1a56db', pointRadius: 4 }] },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => _fmt$(ctx.raw) } } },
      scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => '$' + v.toLocaleString() }, grid: { color: '#f3f4f6' } } },
      responsive: true, maintainAspectRatio: true,
    }
  });
}

function _buildBarChart(year, paid) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  const data = months.map(function(_, m) {
    if (year === now.getFullYear() && m > now.getMonth()) return 0;
    return paid.filter(i => { const d = new Date(i.paid_at || i.created_at); return d.getFullYear() === year && d.getMonth() === m; }).reduce((s,i) => s + Number(i.total), 0);
  });
  const colors = months.map(function(_, m) {
    if (year === now.getFullYear() && m === now.getMonth()) return '#1a56db';
    if (year === now.getFullYear() && m > now.getMonth()) return '#e5e7eb';
    return '#93c5fd';
  });
  _destroyChart('bar');
  const canvas = document.getElementById('analytics-bar-chart');
  if (!canvas) return;
  _chartInstances['bar'] = new Chart(canvas, {
    type: 'bar',
    data: { labels: months, datasets: [{ label: 'Revenue', data, backgroundColor: colors, borderRadius: 4 }] },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => _fmt$(ctx.raw) } } },
      scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => '$' + v.toLocaleString() }, grid: { color: '#f3f4f6' } } },
      responsive: true, maintainAspectRatio: true,
    }
  });
}

function _buildDonutChart(paid, pending) {
  const overdue = pending.filter(i => i.due_date && new Date(i.due_date) < new Date());
  const pendingClean = pending.length - overdue.length;
  _destroyChart('donut');
  const canvas = document.getElementById('analytics-donut-chart');
  if (!canvas) return;
  _chartInstances['donut'] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Paid', 'Pending', 'Overdue'],
      datasets: [{ data: [paid.length, pendingClean, overdue.length], backgroundColor: ['#86efac','#fde68a','#fca5a5'], borderColor: ['#22c55e','#f59e0b','#ef4444'], borderWidth: 2 }]
    },
    options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 14 } } }, responsive: true, maintainAspectRatio: true }
  });
  const legendEl = document.getElementById('donut-legend');
  if (legendEl) legendEl.innerHTML = [['Paid',paid.length,'#22c55e'],['Pending',pendingClean,'#f59e0b'],['Overdue',overdue.length,'#ef4444']]
    .map(function(row) { return '<div style="display:flex;justify-content:space-between;padding:3px 0;"><span style="color:' + row[2] + ';font-weight:600;">' + row[0] + '</span><span style="color:#374151;">' + row[1] + ' invoice' + (row[1]!==1?'s':'') + '</span></div>'; }).join('');
}

function _buildClientsChart(paid) {
  const map = {};
  paid.forEach(i => { map[i.client_name] = (map[i.client_name] || 0) + Number(i.total); });
  const sorted = Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0, 8);
  _destroyChart('clients');
  const canvas = document.getElementById('analytics-clients-chart');
  if (!canvas) return;
  _chartInstances['clients'] = new Chart(canvas, {
    type: 'bar',
    data: { labels: sorted.map(r => r[0]), datasets: [{ label: 'Revenue', data: sorted.map(r => r[1]), backgroundColor: '#bfdbfe', borderColor: '#1a56db', borderWidth: 1, borderRadius: 4 }] },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => _fmt$(ctx.raw) } } },
      scales: { x: { ticks: { callback: v => '$'+v.toLocaleString() }, grid: { color: '#f3f4f6' } }, y: { grid: { display: false } } },
      responsive: true, maintainAspectRatio: false,
    }
  });
}

function _buildEstimatesChart() {
  const total = estimatesCache.length;
  const approved = estimatesCache.filter(e => e.status === 'approved').length;
  const pendingEst = estimatesCache.filter(e => e.status === 'pending').length;
  const rejected = estimatesCache.filter(e => e.status === 'rejected').length;
  _destroyChart('estimates');
  const canvas = document.getElementById('analytics-estimates-chart');
  if (!canvas) return;
  _chartInstances['estimates'] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Total Sent', 'Approved', 'Pending', 'Rejected'],
      datasets: [{ data: [total, approved, pendingEst, rejected], backgroundColor: ['#bfdbfe','#86efac','#fde68a','#fca5a5'], borderRadius: 4 }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false } }, y: { ticks: { stepSize: 1 }, grid: { color: '#f3f4f6' } } },
      responsive: true, maintainAspectRatio: true,
    }
  });
}

// ─── Scheduling ────────────────────────────────────────────────────────────────

let estSchedMode = 'off';

function setEstSchedMode(mode) {
  estSchedMode = mode;
  ['off', 'manager', 'client'].forEach(m => {
    document.getElementById(`est-sched-${m}-btn`)?.classList.toggle('sched-mode-active', m === mode);
  });
  document.getElementById('est-sched-manager-fields').style.display = mode === 'manager' ? '' : 'none';
  document.getElementById('est-sched-client-msg').style.display = mode === 'client' ? '' : 'none';
}

function getEstSchedData() {
  if (estSchedMode === 'off') return {};
  if (estSchedMode === 'manager') {
    const date = document.getElementById('est-sched-date').value;
    const time = document.getElementById('est-sched-time').value;
    const duration = parseInt(document.getElementById('est-sched-duration').value) || 60;
    if (!date || !time) return { schedulingMode: 'manager' };
    return {
      schedulingMode: 'manager',
      scheduledAt: new Date(`${date}T${time}`).toISOString(),
      scheduledDuration: duration,
    };
  }
  if (estSchedMode === 'client') return { schedulingMode: 'client' };
  return {};
}

function getInvSchedData() {
  const date = document.getElementById('inv-sched-date').value;
  const time = document.getElementById('inv-sched-time').value;
  const duration = parseInt(document.getElementById('inv-sched-duration').value) || 60;
  if (!date || !time) return {};
  return {
    scheduledAt: new Date(`${date}T${time}`).toISOString(),
    scheduledDuration: duration,
  };
}

// ─── Google Calendar settings ──────────────────────────────────────────────────

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const HOUR_OPTIONS = [
  [5,'5:00 AM'],[6,'6:00 AM'],[7,'7:00 AM'],[8,'8:00 AM'],[9,'9:00 AM'],
  [10,'10:00 AM'],[11,'11:00 AM'],[12,'12:00 PM'],[13,'1:00 PM'],[14,'2:00 PM'],
  [15,'3:00 PM'],[16,'4:00 PM'],[17,'5:00 PM'],[18,'6:00 PM'],[19,'7:00 PM'],[20,'8:00 PM'],
];

function buildHourSelect(id, selected) {
  return `<select id="${id}" class="wh-select">${HOUR_OPTIONS.map(([v,l]) => `<option value="${v}"${v==selected?' selected':''}>${l}</option>`).join('')}</select>`;
}

function renderWorkHoursGrid(perDay) {
  const grid = document.getElementById('work-hours-grid');
  if (!grid) return;
  const defaultPerDay = { '0':null,'1':{start:8,end:17},'2':{start:8,end:17},'3':{start:8,end:17},'4':{start:8,end:17},'5':{start:8,end:17},'6':null };
  const config = perDay || defaultPerDay;
  grid.innerHTML = DAYS.map((day, i) => {
    const dayCfg = config[String(i)];
    const enabled = dayCfg !== null && dayCfg !== undefined;
    const s = dayCfg?.start ?? 8;
    const e = dayCfg?.end ?? 17;
    return `
      <div class="wh-row" id="wh-row-${i}">
        <label class="wh-day-toggle">
          <input type="checkbox" id="wh-enabled-${i}" ${enabled?'checked':''} onchange="toggleWorkDay(${i})">
          <span class="wh-day-name">${day.slice(0,3)}</span>
        </label>
        <div class="wh-hours-inputs" id="wh-hours-${i}" style="${enabled?'':'opacity:0.35;pointer-events:none;'}">
          ${buildHourSelect('wh-start-'+i, s)}
          <span class="wh-to">to</span>
          ${buildHourSelect('wh-end-'+i, e)}
        </div>
      </div>`;
  }).join('');
}

function toggleWorkDay(dayIdx) {
  const enabled = document.getElementById(`wh-enabled-${dayIdx}`).checked;
  const hoursEl = document.getElementById(`wh-hours-${dayIdx}`);
  hoursEl.style.opacity = enabled ? '' : '0.35';
  hoursEl.style.pointerEvents = enabled ? '' : 'none';
}

async function loadGcalStatus() {
  try {
    const res = await fetch('/api/get-business-profile');
    if (!res.ok) return;
    const profile = await res.json();
    const connected = !!profile.gcal_refresh_token;
    document.getElementById('gcal-connected-msg').style.display = connected ? '' : 'none';
    document.getElementById('gcal-connect-btn').textContent = connected ? 'Reconnect Google Calendar' : 'Connect Google Calendar';
    document.getElementById('gcal-disconnect-btn').style.display = connected ? '' : 'none';
    document.getElementById('gcal-hours-wrap').style.display = connected ? '' : 'none';
    if (connected) {
      renderWorkHoursGrid(profile.work_hours_per_day || null);
    }
    loadSmsTemplates(profile);
    loadReminderSettings(profile);
  } catch {}
}

function connectGoogleCalendar() {
  window.location.href = '/.netlify/functions/google-oauth';
}

async function disconnectGoogleCalendar() {
  if (!confirm('Disconnect Google Calendar? Existing calendar events will not be deleted.')) return;
  try {
    await fetch('/api/save-gcal-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gcal_refresh_token: null }),
    });
    loadGcalStatus();
    showToast('Google Calendar disconnected.', 'success');
  } catch { showToast('Failed to disconnect.', 'error'); }
}

async function saveWorkHoursPerDay() {
  const perDay = {};
  let valid = true;
  for (let i = 0; i < 7; i++) {
    const enabled = document.getElementById(`wh-enabled-${i}`)?.checked;
    if (!enabled) { perDay[String(i)] = null; continue; }
    const start = parseInt(document.getElementById(`wh-start-${i}`).value);
    const end = parseInt(document.getElementById(`wh-end-${i}`).value);
    if (start >= end) { showToast(`${DAYS[i]}: end time must be after start.`, 'error'); valid = false; break; }
    perDay[String(i)] = { start, end };
  }
  if (!valid) return;
  try {
    await fetch('/api/save-gcal-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ work_hours_per_day: perDay }),
    });
    const saved = document.getElementById('gcal-hours-saved');
    saved.style.display = '';
    setTimeout(() => { saved.style.display = 'none'; }, 2000);
  } catch { showToast('Failed to save hours.', 'error'); }
}

// Legacy — kept for backward compatibility
async function saveWorkHours() { return saveWorkHoursPerDay(); }

// ─── SMS Templates ─────────────────────────────────────────────────────────────

const SMS_DEFAULTS = {
  'invoice_new':          'Invoice from {bizName}: ${amount} due. View & pay at {link} — Code: {passcode}',
  'invoice_update':       'Updated invoice from {bizName}: ${amount} due. View & pay at {link} — Code: {passcode}',
  'estimate_new':         'Estimate from {bizName}: ${amount}. View & respond at {link} — Code: {passcode}',
  'estimate_update':      'Updated estimate from {bizName}: ${amount}. View & respond at {link} — Code: {passcode}',
  'event_confirm':        '{bizName}: Your appointment is confirmed for {date}.{serviceCall} Questions? Visit {link}',
  'event_reschedule':     '{bizName}: Your appointment has been rescheduled from {oldDate} to {date}. Questions? Call/text us.',
  'event_reminder_24h':   '{bizName}: Reminder — your appointment is tomorrow at {date}.{serviceCall} Questions? Call/text us.',
  'event_reminder_48h':   '{bizName}: Reminder — your appointment is in 2 days on {date}.{serviceCall} Questions? Call/text us.',
};

const SMS_FIELD_MAP = {
  'invoice_new':          'sms-invoice-new',
  'invoice_update':       'sms-invoice-update',
  'estimate_new':         'sms-estimate-new',
  'estimate_update':      'sms-estimate-update',
  'event_confirm':        'sms-event-confirm',
  'event_reschedule':     'sms-event-reschedule',
  'event_reminder_24h':   'sms-event-reminder-24h',
  'event_reminder_48h':   'sms-event-reminder-48h',
};

function loadSmsTemplates(profile) {
  const saved = profile?.sms_templates || {};
  for (const [key, fieldId] of Object.entries(SMS_FIELD_MAP)) {
    const el = document.getElementById(fieldId);
    if (el) el.value = saved[key] || SMS_DEFAULTS[key] || '';
  }
}

function resetSmsTemplates() {
  for (const [key, fieldId] of Object.entries(SMS_FIELD_MAP)) {
    const el = document.getElementById(fieldId);
    if (el) el.value = SMS_DEFAULTS[key] || '';
  }
}

async function saveSmsTemplates() {
  const templates = {};
  for (const [key, fieldId] of Object.entries(SMS_FIELD_MAP)) {
    const el = document.getElementById(fieldId);
    if (el) templates[key] = el.value.trim() || SMS_DEFAULTS[key];
  }
  try {
    await fetch('/api/save-gcal-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sms_templates: templates }),
    });
    const saved = document.getElementById('sms-templates-saved');
    saved.style.display = '';
    setTimeout(() => { saved.style.display = 'none'; }, 2000);
  } catch { showToast('Failed to save templates.', 'error'); }
}

// ─── Reminder Settings ────────────────────────────────────────────────────────

function loadReminderSettings(profile) {
  const s = profile?.reminder_settings || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
  set('reminder-24h-email', s.h24_email);
  set('reminder-24h-sms',   s.h24_sms);
  set('reminder-48h-email', s.h48_email);
  set('reminder-48h-sms',   s.h48_sms);
}

async function saveReminderSettings() {
  const get = id => !!document.getElementById(id)?.checked;
  const settings = {
    h24_email: get('reminder-24h-email'),
    h24_sms:   get('reminder-24h-sms'),
    h48_email: get('reminder-48h-email'),
    h48_sms:   get('reminder-48h-sms'),
  };
  try {
    await fetch('/api/save-gcal-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reminder_settings: settings }),
    });
    const el = document.getElementById('reminders-saved');
    el.style.display = '';
    setTimeout(() => { el.style.display = 'none'; }, 2000);
  } catch { showToast('Failed to save reminder settings.', 'error'); }
}

// Handle ?gcal= URL param after OAuth redirect
(function handleGcalRedirect() {
  const params = new URLSearchParams(window.location.search);
  const gcal = params.get('gcal');
  if (!gcal) return;
  // Clean the URL
  window.history.replaceState({}, '', window.location.pathname);
  // Show message once settings tab loads
  window._gcalRedirect = gcal;
})();

function handleGcalRedirect() {
  if (!window._gcalRedirect) return;
  const errEl = document.getElementById('gcal-error-msg');
  const okEl = document.getElementById('gcal-connected-msg');
  if (window._gcalRedirect === 'connected') {
    if (okEl) okEl.style.display = '';
    showToast('Google Calendar connected!', 'success');
  } else if (window._gcalRedirect === 'reauth') {
    if (errEl) { errEl.textContent = 'No refresh token received. Please revoke InvoiceMePro access at myaccount.google.com/permissions, then try connecting again.'; errEl.style.display = ''; }
  } else {
    if (errEl) { errEl.textContent = 'Google Calendar connection failed. Please try again.'; errEl.style.display = ''; }
  }
  delete window._gcalRedirect;
}

// Auto-navigate to settings tab after gcal OAuth redirect
document.addEventListener('DOMContentLoaded', () => {
  if (window._gcalRedirect && sessionStorage.getItem('mgr_auth') === '1') {
    setTimeout(() => showTab('settings'), 100);
  }
});

// ─── Inline Schedule Event Modal ──────────────────────────────────────────────

let _smServiceCall = null;
let _smEditId = null;

function openSchedModal(client, editEvt) {
  _smEditId = editEvt?.id || null;

  // Reset form
  ['sm-client-name','sm-client-email','sm-client-phone','sm-notes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('sm-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('sm-time').value = '';
  document.getElementById('sm-time-display').textContent = 'Set time';
  document.getElementById('sm-time-btn').style.borderColor = '';
  document.getElementById('clock-picker-wrap').style.display = 'none';
  document.getElementById('sm-duration').value = '60';
  document.getElementById('sm-error').style.display = 'none';
  document.getElementById('sm-suggestions').style.display = 'none';
  document.getElementById('sm-notify-email').checked = true;
  document.getElementById('sm-notify-sms').checked = true;
  smClearSC();
  _smServiceCall = null;

  const titleEl = document.getElementById('sched-modal-title');
  const submitBtn = document.getElementById('sm-submit-btn');

  if (editEvt) {
    titleEl.textContent = 'Reschedule Event';
    submitBtn.textContent = 'Reschedule';
    document.getElementById('sm-client-name').value = editEvt.client_name || '';
    document.getElementById('sm-client-email').value = editEvt.client_email || '';
    if (editEvt.client_phone) {
      const digits = editEvt.client_phone.replace(/\D/g, '');
      document.getElementById('sm-client-phone').value = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
      document.getElementById('sm-client-cc').value = '+1';
    }
    if (editEvt.scheduled_at) {
      const d = new Date(editEvt.scheduled_at);
      document.getElementById('sm-date').value = d.toISOString().split('T')[0];
      const h24 = d.getHours(), m = d.getMinutes();
      document.getElementById('sm-time').value = `${String(h24).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      _clockH = h24 % 12 || 12;
      _clockM = Math.round(m / 5) * 5; if (_clockM === 60) _clockM = 55;
      _clockAmPm = h24 < 12 ? 'AM' : 'PM';
      document.getElementById('sm-time-display').textContent = `${_clockH}:${String(_clockM).padStart(2,'0')} ${_clockAmPm}`;
      document.getElementById('sm-time-btn').style.borderColor = 'var(--blue)';
    }
    if (editEvt.duration_mins) {
      const sel = document.getElementById('sm-duration');
      if ([30,60,90,120,180,240,480].includes(editEvt.duration_mins)) sel.value = String(editEvt.duration_mins);
    }
    if (editEvt.notes) document.getElementById('sm-notes').value = editEvt.notes;
    if (editEvt.service_call?.amount) {
      _smServiceCall = editEvt.service_call;
      document.querySelectorAll('.sched-sc-btn').forEach(b => {
        if (Number(b.textContent.replace('$','')) === Number(editEvt.service_call.amount)) b.classList.add('sched-sc-active');
      });
      const disp = document.getElementById('sm-sc-display');
      disp.textContent = `Service Call — $${Number(editEvt.service_call.amount).toFixed(0)}.00`;
      disp.style.display = '';
      document.getElementById('sm-sc-clear').style.display = '';
    }
  } else {
    titleEl.textContent = 'New Event';
    submitBtn.textContent = 'Schedule Event';
    if (client) {
      document.getElementById('sm-client-name').value = client.name || '';
      document.getElementById('sm-client-email').value = client.email || '';
      if (client.phone) {
        const digits = client.phone.replace(/\D/g, '');
        document.getElementById('sm-client-phone').value = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
        document.getElementById('sm-client-cc').value = '+1';
      }
    }
  }

  const overlay = document.getElementById('sched-modal-overlay');
  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('sm-client-name').focus(), 100);
}

function closeSchedModal() {
  _smEditId = null;
  document.getElementById('sched-modal-overlay').style.display = 'none';
  document.getElementById('clock-picker-wrap').style.display = 'none';
}

function smClientSearch(val) {
  const el = document.getElementById('sm-suggestions');
  if (!val.trim() || val.length < 2) { el.style.display = 'none'; return; }
  const matches = clientsCache.filter(c => c.name.toLowerCase().includes(val.toLowerCase())).slice(0, 5);
  if (!matches.length) { el.style.display = 'none'; return; }
  el.innerHTML = matches.map(c => `
    <div onclick="smSelectClient(${JSON.stringify(c).replace(/"/g,'&quot;')})"
      style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--gray-100);"
      onmouseenter="this.style.background='#f9fafb'" onmouseleave="this.style.background=''">
      <div style="font-size:14px;font-weight:600;color:var(--gray-900);">${esc(c.name)}</div>
      <div style="font-size:12px;color:var(--gray-400);">${esc(c.email)}${c.phone ? ' · '+esc(c.phone) : ''}</div>
    </div>`).join('');
  el.style.display = '';
}

function smSelectClient(c) {
  document.getElementById('sm-client-name').value = c.name;
  document.getElementById('sm-client-email').value = c.email || '';
  if (c.phone) {
    const digits = c.phone.replace(/\D/g,'');
    document.getElementById('sm-client-phone').value = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    document.getElementById('sm-client-cc').value = '+1';
  }
  document.getElementById('sm-suggestions').style.display = 'none';
}

function smSelectSC(btn, amount) {
  document.querySelectorAll('.sched-sc-btn').forEach(b => b.classList.remove('sched-sc-active'));
  btn.classList.add('sched-sc-active');
  _smServiceCall = { amount, description: 'Service Call' };
  document.getElementById('sm-sc-display').textContent = `Service Call — $${amount}.00`;
  document.getElementById('sm-sc-display').style.display = '';
  document.getElementById('sm-sc-clear').style.display = '';
}

function smClearSC() {
  _smServiceCall = null;
  document.querySelectorAll('.sched-sc-btn').forEach(b => b.classList.remove('sched-sc-active'));
  const disp = document.getElementById('sm-sc-display');
  if (disp) disp.style.display = 'none';
  const clr = document.getElementById('sm-sc-clear');
  if (clr) clr.style.display = 'none';
}

async function submitSchedModal() {
  const clientName  = document.getElementById('sm-client-name').value.trim();
  const clientEmail = document.getElementById('sm-client-email').value.trim();
  const rawPhone    = document.getElementById('sm-client-phone').value.trim();
  const cc          = (document.getElementById('sm-client-cc')?.value || '+1').replace('-CA', '');
  const clientPhone = rawPhone ? normalizePhone(cc + rawPhone.replace(/\D/g, '')) : '';
  const date        = document.getElementById('sm-date').value;
  const time        = document.getElementById('sm-time').value;
  const durationMins = parseInt(document.getElementById('sm-duration').value) || 60;
  const notes       = document.getElementById('sm-notes').value.trim();
  const notifyEmail = document.getElementById('sm-notify-email').checked;
  const notifySms   = document.getElementById('sm-notify-sms').checked;
  const errEl       = document.getElementById('sm-error');
  const isEdit      = !!_smEditId;
  errEl.style.display = 'none';

  if (!clientName)  { errEl.textContent = 'Client name is required.';  errEl.style.display = ''; return; }
  if (!clientEmail) { errEl.textContent = 'Client email is required.'; errEl.style.display = ''; return; }
  if (!date || !time) { errEl.textContent = 'Date and time are required.'; errEl.style.display = ''; return; }

  const scheduledAt = new Date(`${date}T${time}`).toISOString();
  const btn = document.getElementById('sm-submit-btn');
  btn.disabled = true; btn.textContent = isEdit ? 'Rescheduling...' : 'Scheduling...';

  try {
    let res;
    if (isEdit) {
      res = await fetch('/api/update-scheduled-event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: _smEditId, scheduledAt, durationMins,
          serviceCall: _smServiceCall || null,
          notes: notes || null,
          sendNotifications: notifyEmail || notifySms,
        }),
      });
    } else {
      res = await fetch('/api/create-scheduled-event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName, clientEmail, clientPhone, scheduledAt, durationMins,
          serviceCall: _smServiceCall || null,
          notes: notes || null,
          sendNotifications: notifyEmail || notifySms,
        }),
      });
    }
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Failed.'; errEl.style.display = ''; return; }
    closeSchedModal();
    showToast(isEdit ? 'Event rescheduled!' : 'Event scheduled!', 'success');
    loadSchedule();
  } catch {
    errEl.textContent = 'Network error. Please try again.'; errEl.style.display = '';
  } finally {
    btn.disabled = false; btn.textContent = isEdit ? 'Reschedule' : 'Schedule Event';
  }
}

// ─── Clock Picker ─────────────────────────────────────────────────────────────

let _clockStep = 'hour'; // 'hour' | 'minute'
let _clockH = 9;         // 1–12
let _clockM = 0;         // 0, 5, 10 … 55
let _clockAmPm = 'AM';

function openClockPicker() {
  const val = document.getElementById('sm-time').value;
  if (val) {
    const [hStr, mStr] = val.split(':');
    const h24 = parseInt(hStr, 10);
    _clockH = h24 % 12 || 12;
    _clockM = Math.round(parseInt(mStr, 10) / 5) * 5; if (_clockM === 60) _clockM = 55;
    _clockAmPm = h24 < 12 ? 'AM' : 'PM';
  } else {
    _clockH = 9; _clockM = 0; _clockAmPm = 'AM';
  }
  _clockStep = 'hour';
  const wrap = document.getElementById('clock-picker-wrap');
  wrap.style.display = '';
  _buildClockHtml();
  document.getElementById('sm-time-btn').style.borderColor = 'var(--blue)';
}

function closeClockPicker(confirm) {
  if (confirm) {
    let h24 = _clockH % 12;
    if (_clockAmPm === 'PM') h24 += 12;
    const val = String(h24).padStart(2,'0') + ':' + String(_clockM).padStart(2,'0');
    document.getElementById('sm-time').value = val;
    document.getElementById('sm-time-display').textContent = _clockH + ':' + String(_clockM).padStart(2,'0') + ' ' + _clockAmPm;
  }
  document.getElementById('clock-picker-wrap').style.display = 'none';
}

function _buildClockHtml() {
  const wrap = document.getElementById('clock-picker-wrap');
  if (!wrap) return;
  const hDisp = String(_clockH).padStart(2,'0');
  const mDisp = String(_clockM).padStart(2,'0');
  const hourActive = _clockStep === 'hour';
  const hBg = hourActive ? 'background:#eff6ff;color:#1a56db;' : 'color:var(--gray-400);';
  const mBg = !hourActive ? 'background:#eff6ff;color:#1a56db;' : 'color:var(--gray-400);';
  const amBg = _clockAmPm === 'AM' ? '#1a56db' : '#fff';
  const amClr = _clockAmPm === 'AM' ? '#fff' : 'var(--gray-600)';
  const amBdr = _clockAmPm === 'AM' ? '#1a56db' : 'var(--gray-200)';
  const pmBg = _clockAmPm === 'PM' ? '#1a56db' : '#fff';
  const pmClr = _clockAmPm === 'PM' ? '#fff' : 'var(--gray-600)';
  const pmBdr = _clockAmPm === 'PM' ? '#1a56db' : 'var(--gray-200)';
  const stepLabel = hourActive ? 'Select Hour' : 'Select Minute';

  wrap.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;gap:2px;margin-bottom:18px;">' +
      '<div onclick="clockGoStep(\'hour\')" style="font-size:44px;font-weight:700;cursor:pointer;padding:4px 10px;border-radius:10px;line-height:1;' + hBg + '">' + hDisp + '</div>' +
      '<div style="font-size:44px;font-weight:300;color:var(--gray-300);line-height:1;padding:0 2px;">:</div>' +
      '<div onclick="clockGoStep(\'minute\')" style="font-size:44px;font-weight:700;cursor:pointer;padding:4px 10px;border-radius:10px;line-height:1;' + mBg + '">' + mDisp + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:5px;margin-left:12px;">' +
        '<button type="button" onclick="clockSetAmPm(\'AM\')" style="padding:6px 11px;border-radius:8px;border:1.5px solid ' + amBdr + ';background:' + amBg + ';color:' + amClr + ';font-size:13px;font-weight:700;cursor:pointer;">AM</button>' +
        '<button type="button" onclick="clockSetAmPm(\'PM\')" style="padding:6px 11px;border-radius:8px;border:1.5px solid ' + pmBdr + ';background:' + pmBg + ';color:' + pmClr + ';font-size:13px;font-weight:700;cursor:pointer;">PM</button>' +
      '</div>' +
    '</div>' +
    '<div style="font-size:11px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.08em;text-align:center;margin-bottom:10px;">' + stepLabel + '</div>' +
    '<svg id="clock-svg" viewBox="0 0 300 300" width="100%" style="display:block;max-width:260px;margin:0 auto;"></svg>' +
    '<button type="button" onclick="closeClockPicker(true)" style="margin-top:14px;width:100%;padding:12px;background:#1a56db;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">Done</button>';

  _renderClockFace();
}

function _renderClockFace() {
  const svg = document.getElementById('clock-svg');
  if (!svg) return;
  const cx = 150, cy = 150;
  const isHour = _clockStep === 'hour';
  const nums = isHour
    ? [12,1,2,3,4,5,6,7,8,9,10,11]
    : [0,5,10,15,20,25,30,35,40,45,50,55];

  const handAngle = isHour
    ? (_clockH % 12) / 12 * 2 * Math.PI - Math.PI / 2
    : _clockM / 60 * 2 * Math.PI - Math.PI / 2;
  const hx = (cx + Math.cos(handAngle) * 88).toFixed(1);
  const hy = (cy + Math.sin(handAngle) * 88).toFixed(1);

  let items = '';
  for (let i = 0; i < nums.length; i++) {
    const num = nums[i];
    const a = i / 12 * 2 * Math.PI - Math.PI / 2;
    const nx = (cx + Math.cos(a) * 95).toFixed(1);
    const ny = (cy + Math.sin(a) * 95).toFixed(1);
    const sel = isHour ? _clockH === num : _clockM === num;
    const fillCircle = sel ? '#1a56db' : 'transparent';
    const fillText = sel ? '#fff' : '#374151';
    const fw = sel ? '700' : '500';
    items += '<g onclick="clockPick(' + num + ')" style="cursor:pointer;">' +
      '<circle cx="' + nx + '" cy="' + ny + '" r="22" fill="' + fillCircle + '"/>' +
      '<text x="' + nx + '" y="' + ny + '" text-anchor="middle" dominant-baseline="central" fill="' + fillText + '" font-size="14" font-weight="' + fw + '" font-family="system-ui,Arial,sans-serif">' + num + '</text>' +
      '</g>';
  }

  svg.innerHTML =
    '<circle cx="' + cx + '" cy="' + cy + '" r="128" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.5"/>' +
    '<line x1="' + cx + '" y1="' + cy + '" x2="' + hx + '" y2="' + hy + '" stroke="#1a56db" stroke-width="3" stroke-linecap="round"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="#1a56db"/>' +
    '<circle cx="' + hx + '" cy="' + hy + '" r="18" fill="#1a56db" opacity="0.18"/>' +
    items;
}

function clockGoStep(step) {
  _clockStep = step;
  _buildClockHtml();
}

function clockSetAmPm(ampm) {
  _clockAmPm = ampm;
  _buildClockHtml();
}

function clockPick(num) {
  if (_clockStep === 'hour') {
    _clockH = num;
    _clockStep = 'minute';
    _buildClockHtml();
  } else {
    _clockM = num;
    closeClockPicker(true);
  }
}

// ─── Event Detail Sheet ────────────────────────────────────────────────────────

let _detailEventId = null;

function openEventDetail(id) {
  const evt = calEvents.find(function(e) { return String(e.id) === String(id); });
  if (!evt) return;
  _detailEventId = id;

  const d = new Date(evt.scheduled_at);
  const timeStr = d.toLocaleString('en-US', {
    weekday:'long', month:'long', day:'numeric', year:'numeric',
    hour:'numeric', minute:'2-digit', hour12:true,
  });
  const durMins = evt.duration_mins || evt.scheduled_duration || 60;
  const durStr = durMins >= 60
    ? (durMins/60) + ' hour' + (durMins > 60 ? 's' : '')
    : durMins + ' min';

  document.getElementById('evt-detail-name').textContent = evt.client_name;
  document.getElementById('evt-detail-time').textContent = timeStr;
  document.getElementById('evt-detail-dur').textContent = durStr;

  let chips = '';
  if (evt.client_email) chips += '<a href="mailto:' + esc(evt.client_email) + '" class="sch-contact-chip">' + esc(evt.client_email) + '</a>';
  if (evt.client_phone) chips += '<a href="tel:' + esc(evt.client_phone) + '" class="sch-contact-chip">' + esc(evt.client_phone) + '</a>';
  document.getElementById('evt-detail-contacts').innerHTML = chips;

  const scRow = document.getElementById('evt-detail-sc-row');
  if (evt.service_call && evt.service_call.amount) {
    document.getElementById('evt-detail-sc-amt').textContent = '$' + Number(evt.service_call.amount).toFixed(2);
    scRow.style.display = '';
  } else {
    scRow.style.display = 'none';
  }

  const notesWrap = document.getElementById('evt-detail-notes-wrap');
  if (evt.notes) {
    notesWrap.textContent = evt.notes;
    notesWrap.style.display = '';
  } else {
    notesWrap.style.display = 'none';
  }

  document.getElementById('evt-detail-overlay').style.display = '';
}

function closeEventDetail() {
  document.getElementById('evt-detail-overlay').style.display = 'none';
  _detailEventId = null;
}

function rescheduleCurrentEvent() {
  const evt = calEvents.find(function(e) { return String(e.id) === String(_detailEventId); });
  if (!evt) return;
  closeEventDetail();
  openSchedModal(null, evt);
}

async function deleteCurrentEvent() {
  if (!_detailEventId) return;
  const evt = calEvents.find(function(e) { return String(e.id) === String(_detailEventId); });
  const name = evt ? evt.client_name : 'this event';
  if (!confirm('Delete event for ' + name + '? This cannot be undone.')) return;
  try {
    const res = await fetch('/api/delete-scheduled-event?id=' + _detailEventId, { method: 'POST' });
    if (!res.ok) { showToast('Failed to delete event.', 'error'); return; }
    closeEventDetail();
    showToast('Event deleted.', 'success');
    loadSchedule();
  } catch(e) {
    showToast('Network error.', 'error');
  }
}

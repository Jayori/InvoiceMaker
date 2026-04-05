// Load business name
fetch('/api/get-business-profile')
  .then(r => r.json())
  .then(biz => {
    const name = biz.name || 'Invoice Pro';
    document.title = `Pay Invoice — ${name}`;
    document.querySelectorAll('.client-biz-name').forEach(el => el.textContent = name);
  }).catch(() => {});

// Auto-uppercase passcode input
const input = document.getElementById('passcode-input');
if (input) {
  input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });
}

// Check if redirected back after payment (?paid=PASSCODE)
const params = new URLSearchParams(window.location.search);
const paidCode = params.get('paid');
if (paidCode) {
  window.history.replaceState({}, '', 'client.html');
  loadInvoice(paidCode, true);
}

async function lookupInvoice(e) {
  e.preventDefault();
  const code = document.getElementById('passcode-input').value.trim().toUpperCase();
  if (!code) return;
  await loadInvoice(code, false);
}

async function loadInvoice(code, justPaid) {
  const btn = document.getElementById('lookup-btn');
  const errEl = document.getElementById('lookup-error');
  if (btn) { btn.disabled = true; btn.textContent = 'Looking up...'; }
  if (errEl) errEl.style.display = 'none';

  try {
    const res = await fetch('/api/get-invoice-by-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: code }),
    });
    const data = await res.json();

    if (!res.ok) {
      if (errEl) { errEl.textContent = data.error || 'Code not found.'; errEl.style.display = ''; }
      return;
    }

    if (data.mode === 'profile') {
      showProfile(data.client, data.invoices, justPaid);
    } else {
      // Legacy fallback: old per-invoice passcode
      showInvoice(data, justPaid);
      loadInvoiceHistory(data.client_email, data.id);
    }
  } catch {
    if (errEl) { errEl.textContent = 'Something went wrong. Please try again.'; errEl.style.display = ''; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'View My Invoices'; }
  }
}

// ── Profile mode (new) ────────────────────────────────────────────────────────

function showProfile(client, invoices, justPaid) {
  document.getElementById('passcode-view').style.display = 'none';
  document.getElementById('invoice-view').style.display = '';

  // Greeting
  const greetEl = document.getElementById('inv-client-greeting');
  if (greetEl) { greetEl.textContent = `Hello, ${client.name}`; greetEl.style.display = ''; }

  // Feature the first unpaid invoice, or most recent if all paid
  const pending = invoices.filter(i => i.status !== 'paid');
  const featured = pending[0] || invoices[0];

  if (featured) {
    renderInvoiceDetails(featured, justPaid);
  } else {
    // No invoices yet — hide invoice details area
    document.getElementById('inv-header').style.display = 'none';
    document.getElementById('inv-meta').style.display = 'none';
    document.querySelector('.inv-items-table').style.display = 'none';
    document.getElementById('inv-totals').style.display = 'none';
    document.getElementById('pay-section').style.display = 'none';
  }

  showHistoryFromList(invoices, featured?.id);
}

// ── Invoice detail rendering ──────────────────────────────────────────────────

function showInvoice(inv, justPaid) {
  document.getElementById('passcode-view').style.display = 'none';
  document.getElementById('invoice-view').style.display = '';
  renderInvoiceDetails(inv, justPaid);
}

function renderInvoiceDetails(inv, justPaid) {
  // Restore visibility in case showProfile hid them
  ['inv-header', 'inv-meta'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
  const table = document.querySelector('.inv-items-table');
  if (table) table.style.display = '';
  const totals = document.getElementById('inv-totals');
  if (totals) totals.style.display = '';

  document.getElementById('inv-number').textContent = inv.invoice_number;

  const statusEl = document.getElementById('inv-status');
  if (inv.status === 'paid') {
    statusEl.textContent = 'Paid';
    statusEl.className = 'inv-status-badge inv-status-paid';
  } else {
    statusEl.textContent = 'Payment Due';
    statusEl.className = 'inv-status-badge inv-status-pending';
  }

  document.getElementById('inv-total-big').textContent = `$${Number(inv.total).toFixed(2)}`;
  document.getElementById('inv-client').textContent = inv.client_name;
  document.getElementById('inv-due').textContent = inv.due_date
    ? new Date(inv.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Upon receipt';

  // Line items
  const tbody = document.getElementById('inv-items-tbody');
  tbody.innerHTML = (inv.items || []).map(item => {
    const lineTotal = (item.quantity * item.unitPrice).toFixed(2);
    const qtyLabel = item.type === 'hours' ? `${item.quantity} hrs` : `x${item.quantity}`;
    return `<tr>
      <td>${esc(item.description)}${item.type === 'hours' ? ' <span class="item-type-tag">hourly</span>' : ''}</td>
      <td style="text-align:center;color:var(--gray-500);">${qtyLabel}</td>
      <td style="text-align:right;">$${Number(item.unitPrice).toFixed(2)}</td>
      <td style="text-align:right;font-weight:500;">$${lineTotal}</td>
    </tr>`;
  }).join('');

  // Totals
  document.getElementById('inv-subtotal').textContent = `$${Number(inv.subtotal).toFixed(2)}`;
  document.getElementById('inv-total').textContent = `$${Number(inv.total).toFixed(2)}`;
  if (inv.tax_rate > 0) {
    document.getElementById('inv-tax-row').style.display = '';
    document.getElementById('inv-tax-label').textContent = `Tax (${inv.tax_rate}%)`;
    document.getElementById('inv-tax-amount').textContent = `$${Number(inv.tax_amount).toFixed(2)}`;
  } else {
    document.getElementById('inv-tax-row').style.display = 'none';
  }

  // Notes
  if (inv.notes) {
    document.getElementById('inv-notes-section').style.display = '';
    document.getElementById('inv-notes').textContent = inv.notes;
  } else {
    document.getElementById('inv-notes-section').style.display = 'none';
  }

  // Pay button / paid notice
  if (inv.status === 'paid' || justPaid) {
    document.getElementById('pay-section').style.display = 'none';
    document.getElementById('paid-notice').style.display = '';
  } else {
    document.getElementById('pay-section').style.display = '';
    document.getElementById('paid-notice').style.display = 'none';
    document.getElementById('pay-btn').href = inv.square_payment_link || '#';
  }
}

// ── Invoice history list ──────────────────────────────────────────────────────

function showHistoryFromList(invoices, currentId) {
  const section = document.getElementById('history-section');
  const loading = document.getElementById('history-loading');
  const list = document.getElementById('history-list');
  if (!section) return;

  if (!invoices || invoices.length === 0) { section.style.display = 'none'; return; }

  section.style.display = '';
  if (loading) loading.style.display = 'none';

  list.innerHTML = invoices.map(inv => {
    const isCurrent = inv.id === currentId;
    const statusClass = inv.status === 'paid' ? 'inv-status-paid' : 'inv-status-pending';
    const statusLabel = inv.status === 'paid' ? 'Paid' : 'Unpaid';
    const dateStr = inv.created_at
      ? new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';
    return `
      <div class="history-item${isCurrent ? ' history-item-current' : ''}">
        <div class="history-item-left">
          <div class="history-inv-num">${esc(inv.invoice_number)}${isCurrent ? ' <span class="history-current-tag">Shown Above</span>' : ''}</div>
          <div class="history-inv-date">${dateStr}</div>
        </div>
        <div class="history-item-right">
          <div class="history-inv-amount">$${Number(inv.total).toFixed(2)}</div>
          <span class="inv-status-badge ${statusClass}">${statusLabel}</span>
          ${inv.status !== 'paid' && !isCurrent && inv.square_payment_link ? `<a href="${esc(inv.square_payment_link)}" target="_blank" class="btn btn-sm btn-primary" style="margin-top:4px;">Pay</a>` : ''}
        </div>
      </div>`;
  }).join('');
}

// Legacy fetch-based history (used for old invoice-level passcode fallback)
async function loadInvoiceHistory(email, currentId) {
  const section = document.getElementById('history-section');
  const loading = document.getElementById('history-loading');
  if (!section || !email) return;
  section.style.display = '';

  try {
    const res = await fetch('/api/get-client-invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const invoices = await res.json();
    showHistoryFromList(invoices, currentId);
  } catch {
    if (loading) loading.textContent = 'Could not load history.';
  }
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

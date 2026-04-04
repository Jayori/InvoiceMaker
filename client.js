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
      if (errEl) { errEl.textContent = data.error || 'Invoice not found.'; errEl.style.display = ''; }
      return;
    }

    showInvoice(data, justPaid);
  } catch {
    if (errEl) { errEl.textContent = 'Something went wrong. Please try again.'; errEl.style.display = ''; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'View My Invoice'; }
  }
}

function showInvoice(inv, justPaid) {
  document.getElementById('passcode-view').style.display = 'none';
  const view = document.getElementById('invoice-view');
  view.style.display = '';

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
  }

  // Notes
  if (inv.notes) {
    document.getElementById('inv-notes-section').style.display = '';
    document.getElementById('inv-notes').textContent = inv.notes;
  }

  // Pay button
  if (inv.status === 'paid' || justPaid) {
    document.getElementById('pay-section').style.display = 'none';
    document.getElementById('paid-notice').style.display = '';
  } else {
    document.getElementById('pay-btn').href = inv.square_payment_link || '#';
  }
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

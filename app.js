// ─── View switching ──────────────────────────────────────────────────────────

function showList() {
  document.getElementById('list-view').style.display = '';
  document.getElementById('create-view').style.display = 'none';
  document.getElementById('back-btn').style.display = 'none';
  document.getElementById('new-invoice-btn').style.display = '';
  loadInvoices();
}

function showCreate() {
  document.getElementById('list-view').style.display = 'none';
  document.getElementById('create-view').style.display = '';
  document.getElementById('back-btn').style.display = '';
  document.getElementById('new-invoice-btn').style.display = 'none';
  // Add first item row if empty
  if (document.getElementById('items-tbody').children.length === 0) {
    addItem();
  }
}

// ─── Line items ──────────────────────────────────────────────────────────────

let itemIdCounter = 0;

function addItem(description = '', quantity = 1, unitPrice = '') {
  const id = ++itemIdCounter;
  const tbody = document.getElementById('items-tbody');
  const tr = document.createElement('tr');
  tr.id = `item-row-${id}`;
  tr.innerHTML = `
    <td><input type="text" placeholder="Service or product description" value="${escAttr(description)}" required oninput="recalcTotals()"></td>
    <td><input type="number" value="${quantity}" min="1" step="1" required oninput="recalcTotals()" style="width:70px;"></td>
    <td><input type="number" value="${unitPrice}" placeholder="0.00" min="0" step="0.01" required oninput="recalcTotals()" style="width:100px;"></td>
    <td class="item-total-cell" id="item-total-${id}">$0.00</td>
    <td><button type="button" class="remove-item-btn" onclick="removeItem(${id})" title="Remove">&#x2715;</button></td>
  `;
  tbody.appendChild(tr);
  recalcTotals();
}

function removeItem(id) {
  const row = document.getElementById(`item-row-${id}`);
  if (row) {
    row.remove();
    recalcTotals();
  }
}

function getItems() {
  const rows = document.getElementById('items-tbody').querySelectorAll('tr');
  return Array.from(rows).map(row => {
    const inputs = row.querySelectorAll('input');
    return {
      description: inputs[0].value.trim(),
      quantity: parseFloat(inputs[1].value) || 0,
      unitPrice: parseFloat(inputs[2].value) || 0,
    };
  });
}

function recalcTotals() {
  const items = getItems();
  const taxRate = parseFloat(document.getElementById('tax-rate').value) || 0;
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  // Update per-row totals
  document.getElementById('items-tbody').querySelectorAll('tr').forEach((row, i) => {
    const item = items[i];
    const cell = row.querySelector('.item-total-cell');
    if (cell && item) {
      cell.textContent = `$${(item.quantity * item.unitPrice).toFixed(2)}`;
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

// ─── Submit invoice ───────────────────────────────────────────────────────────

async function submitInvoice(e) {
  e.preventDefault();

  const items = getItems();
  if (items.length === 0 || items.some(i => !i.description || i.quantity <= 0 || i.unitPrice < 0)) {
    showToast('Please fill in all line item fields.', 'error');
    return;
  }

  const payload = {
    clientName: document.getElementById('client-name').value.trim(),
    clientEmail: document.getElementById('client-email').value.trim(),
    items,
    taxRate: parseFloat(document.getElementById('tax-rate').value) || 0,
    notes: document.getElementById('notes').value.trim(),
    dueDate: document.getElementById('due-date').value || null,
  };

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Sending...';

  try {
    const res = await fetch('/api/create-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong');
    }

    showToast(`Invoice ${data.invoice_number} sent to ${payload.clientEmail}!`, 'success');
    document.getElementById('invoice-form').reset();
    document.getElementById('items-tbody').innerHTML = '';
    itemIdCounter = 0;
    recalcTotals();
    setTimeout(() => showList(), 1500);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Send Invoice & Payment Link';
  }
}

// ─── Load invoices ────────────────────────────────────────────────────────────

async function loadInvoices() {
  const loading = document.getElementById('list-loading');
  const table = document.getElementById('invoice-table');
  const empty = document.getElementById('empty-state');
  const tbody = document.getElementById('invoice-tbody');
  const countEl = document.getElementById('invoice-count');

  loading.style.display = '';
  table.style.display = 'none';
  empty.style.display = 'none';

  try {
    const res = await fetch('/api/get-invoices');
    if (!res.ok) throw new Error('Failed to load');
    const invoices = await res.json();

    loading.style.display = 'none';
    countEl.textContent = invoices.length ? `${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}` : '';

    if (invoices.length === 0) {
      empty.style.display = '';
      return;
    }

    tbody.innerHTML = invoices.map(inv => `
      <tr>
        <td>
          <div class="client-name">${esc(inv.client_name)}</div>
          <div class="invoice-num">${esc(inv.client_email)}</div>
        </td>
        <td>${esc(inv.invoice_number)}</td>
        <td>${formatDate(inv.created_at)}</td>
        <td>${inv.due_date ? formatDate(inv.due_date) : '—'}</td>
        <td class="amount">$${Number(inv.total).toFixed(2)}</td>
        <td><span class="badge badge-${inv.status}">${capitalize(inv.status)}</span></td>
        <td>
          ${inv.square_payment_link ? `<a href="${esc(inv.square_payment_link)}" target="_blank" class="btn btn-sm btn-secondary">View Link</a>` : ''}
        </td>
      </tr>
    `).join('');

    table.style.display = '';
  } catch (err) {
    loading.textContent = 'Failed to load invoices.';
    loading.style.display = '';
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────

let toastTimer;
function showToast(message, type = '') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 4000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Check for ?paid=INV-xxx in URL (Square redirect after payment)
  const params = new URLSearchParams(window.location.search);
  const paidInvoice = params.get('paid');
  if (paidInvoice) {
    document.getElementById('paid-banner').style.display = '';
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
  }

  loadInvoices();
});

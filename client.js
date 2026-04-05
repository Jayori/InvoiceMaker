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
      showProfile(data.client, data.invoices, justPaid, code);
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

// ── Profile mode ─────────────────────────────────────────────────────────────

let clientPasscode = '';

function showProfile(client, invoices, justPaid, passcode) {
  clientPasscode = passcode || '';
  document.getElementById('passcode-view').style.display = 'none';
  document.getElementById('invoice-view').style.display = '';

  const greetEl = document.getElementById('inv-client-greeting');
  if (greetEl) { greetEl.textContent = `Hello, ${client.name}`; greetEl.style.display = ''; }

  const pending = invoices.filter(i => i.status !== 'paid');
  const featured = pending[0] || invoices[0];

  if (featured) {
    renderInvoiceDetails(featured, justPaid);
  } else {
    document.getElementById('inv-header').style.display = 'none';
    document.getElementById('inv-meta').style.display = 'none';
    const tbl = document.querySelector('.inv-items-table');
    if (tbl) tbl.style.display = 'none';
    document.getElementById('inv-totals').style.display = 'none';
    document.getElementById('pay-section').style.display = 'none';
  }

  showHistoryFromList(invoices, featured?.id);
  renderEstimates(client.estimates || []);
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

// ── Estimates ─────────────────────────────────────────────────────────────────

function renderEstimates(estimates) {
  const section = document.getElementById('estimates-section');
  const list = document.getElementById('estimates-list');
  if (!section || !estimates.length) { if (section) section.style.display = 'none'; return; }

  section.style.display = '';
  list.innerHTML = estimates.map(est => {
    const completion = est.estimated_completion_date
      ? new Date(est.estimated_completion_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : null;
    const statusClass = est.status === 'approved' ? 'est-status-approved' : est.status === 'rejected' ? 'est-status-rejected' : 'est-status-pending';
    const statusLabel = est.status === 'approved' ? 'Approved' : est.status === 'rejected' ? 'Declined' : 'Awaiting Your Response';
    const isPending = est.status === 'pending';
    const dateStr = est.created_at ? new Date(est.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

    const itemRows = (est.items || []).map(item => `
      <div class="est-item-row">
        <div class="est-item-info">
          <div class="est-item-desc">${esc(item.description)}</div>
          ${item.explanation ? `<div class="est-item-expl">${esc(item.explanation)}</div>` : ''}
          ${item.estimatedDays ? `<div class="est-item-days">Est. ${item.estimatedDays} day${Number(item.estimatedDays) !== 1 ? 's' : ''}</div>` : ''}
        </div>
        <div class="est-item-cost">$${Number(item.cost).toFixed(2)}</div>
      </div>`).join('');

    const messages = est.messages || [];
    const chatHtml = messages.length ? `
      <div class="est-chat-section">
        <div class="est-chat-title">Messages</div>
        ${messages.map(m => `
          <div class="chat-bubble ${m.sender === 'client' ? 'chat-bubble-client' : 'chat-bubble-manager'}">
            <div class="chat-bubble-meta">${m.sender === 'client' ? 'You' : 'Business'} · ${new Date(m.created_at).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}</div>
            <div class="chat-bubble-text">${esc(m.message)}</div>
          </div>`).join('')}
      </div>` : '';

    const msgFormHtml = isPending ? `
      <div class="est-msg-form" id="msg-form-${est.id}" style="display:none;">
        <textarea id="msg-input-${est.id}" placeholder="Type your question..." style="width:100%;min-height:70px;resize:vertical;margin-bottom:8px;"></textarea>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary btn-sm" onclick="sendEstimateQuestion('${est.id}')">Send Question</button>
          <button class="btn btn-secondary btn-sm" onclick="toggleMsgForm('${est.id}')">Cancel</button>
        </div>
      </div>` : '';

    return `
      <div class="est-card" id="est-card-${est.id}">
        <div class="est-card-header">
          <div>
            <div class="est-num">${esc(est.estimate_number)}</div>
            <div class="est-date">${dateStr}</div>
          </div>
          <span class="est-status-badge ${statusClass}">${statusLabel}</span>
        </div>

        <div class="est-items">${itemRows}</div>

        ${est.tax_rate > 0 ? `<div class="est-subtotal-row"><span>Subtotal</span><span>$${Number(est.subtotal).toFixed(2)}</span></div>
        <div class="est-subtotal-row"><span>Tax (${est.tax_rate}%)</span><span>$${Number(est.tax_amount).toFixed(2)}</span></div>` : ''}

        <div class="est-big-row">
          <div class="est-big-block">
            <div class="est-big-label">Total Estimate</div>
            <div class="est-big-value est-big-total">$${Number(est.total).toFixed(2)}</div>
          </div>
          ${completion ? `<div class="est-big-block est-big-right">
            <div class="est-big-label">Estimated Completion</div>
            <div class="est-big-value est-big-date">${completion}</div>
          </div>` : ''}
        </div>

        ${est.notes ? `<div class="est-notes">${esc(est.notes)}</div>` : ''}

        ${isPending ? `
        <div class="est-actions">
          <button class="btn est-btn-approve" onclick="estimateAction('${est.id}', 'approve')">✓ Approve</button>
          <button class="btn est-btn-reject" onclick="estimateAction('${est.id}', 'reject')">✗ Decline</button>
          <button class="btn est-btn-question" onclick="toggleMsgForm('${est.id}')">? Ask a Question</button>
        </div>` : ''}

        ${chatHtml}
        ${msgFormHtml}
      </div>`;
  }).join('');
}

function toggleMsgForm(estimateId) {
  const form = document.getElementById(`msg-form-${estimateId}`);
  if (form) form.style.display = form.style.display === 'none' ? '' : 'none';
}

async function estimateAction(estimateId, action) {
  const card = document.getElementById(`est-card-${estimateId}`);
  const word = action === 'approve' ? 'approve' : 'decline';
  if (!confirm(`Are you sure you want to ${word} this estimate?`)) return;

  try {
    const res = await fetch('/api/estimate-action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estimateId, passcode: clientPasscode, action }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Failed'); return; }

    // Update status badge and remove action buttons
    if (card) {
      const badge = card.querySelector('.est-status-badge');
      if (badge) {
        if (action === 'approve') { badge.textContent = 'Approved'; badge.className = 'est-status-badge est-status-approved'; }
        else { badge.textContent = 'Declined'; badge.className = 'est-status-badge est-status-rejected'; }
      }
      const actions = card.querySelector('.est-actions');
      if (actions) actions.remove();
      const msgForm = card.querySelector('.est-msg-form');
      if (msgForm) msgForm.remove();
    }
  } catch { alert('Something went wrong. Please try again.'); }
}

async function sendEstimateQuestion(estimateId) {
  const input = document.getElementById(`msg-input-${estimateId}`);
  const message = input?.value.trim();
  if (!message) return;

  const btn = document.querySelector(`#msg-form-${estimateId} .btn-primary`);
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

  try {
    const res = await fetch('/api/estimate-action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estimateId, passcode: clientPasscode, action: 'message', message }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Failed to send'); return; }

    // Append message to chat
    const card = document.getElementById(`est-card-${estimateId}`);
    let chatSection = card?.querySelector('.est-chat-section');
    if (!chatSection) {
      const msgForm = document.getElementById(`msg-form-${estimateId}`);
      chatSection = document.createElement('div');
      chatSection.className = 'est-chat-section';
      chatSection.innerHTML = '<div class="est-chat-title">Messages</div>';
      card.insertBefore(chatSection, msgForm);
    }
    const time = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble-client';
    bubble.innerHTML = `<div class="chat-bubble-meta">You · ${time}</div><div class="chat-bubble-text">${esc(message)}</div>`;
    chatSection.appendChild(bubble);
    input.value = '';
    document.getElementById(`msg-form-${estimateId}`).style.display = 'none';
  } catch { alert('Something went wrong.'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Send Question'; } }
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

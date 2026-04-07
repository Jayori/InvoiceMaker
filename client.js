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
      showProfile(data.client, data.invoices, data.estimates || [], justPaid, code);
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

function showProfile(client, invoices, estimates, justPaid, passcode) {
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
    // No invoices — hide the invoice display area entirely
    ['.inv-header', '.inv-meta', '.inv-items-table'].forEach(sel => {
      const el = document.querySelector(sel); if (el) el.style.display = 'none';
    });
    ['inv-totals', 'pay-section', 'paid-notice', 'history-section'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
  }

  showHistoryFromList(invoices, featured?.id);
  renderEstimates(estimates);
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

  // Line items — group by work date
  const tbody = document.getElementById('inv-items-tbody');
  const dated = {}, undated = [];
  (inv.items || []).forEach(item => {
    if (item.workDate) {
      if (!dated[item.workDate]) dated[item.workDate] = [];
      dated[item.workDate].push(item);
    } else {
      undated.push(item);
    }
  });

  function buildItemRow(item) {
    const lineTotal = item.quantity * item.unitPrice;
    const disc = Math.min(Number(item.discount) || 0, lineTotal);
    const netTotal = lineTotal - disc;
    const qtyLabel = item.type === 'hours' ? `${item.quantity} hrs` : `x${item.quantity}`;
    const rateDisplay = disc > 0
      ? `<span class="item-original-amt">$${Number(item.unitPrice).toFixed(2)}</span>`
      : `$${Number(item.unitPrice).toFixed(2)}`;
    const discountRow = disc > 0
      ? `<tr><td colspan="3" style="padding:1px 0 6px;font-size:12px;"><span class="item-discount-credit">✓ Courtesy discount: -$${disc.toFixed(2)}</span></td><td></td></tr>`
      : '';
    return `<tr>
      <td>${esc(item.description)}${item.type === 'hours' ? ' <span class="item-type-tag">hourly</span>' : ''}</td>
      <td style="text-align:center;color:var(--gray-500);">${qtyLabel}</td>
      <td style="text-align:right;">${rateDisplay}</td>
      <td style="text-align:right;font-weight:500;">$${netTotal.toFixed(2)}</td>
    </tr>${discountRow}`;
  }

  let rowsHtml = undated.map(buildItemRow).join('');
  Object.keys(dated).sort().forEach(date => {
    const dateStr = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    rowsHtml += `<tr><td colspan="4"><div class="work-date-header">${esc(dateStr)}</div></td></tr>`;
    rowsHtml += dated[date].map(buildItemRow).join('');
  });
  tbody.innerHTML = rowsHtml;

  // Receipt photos
  const photosSection = document.getElementById('inv-photos-section');
  if (photosSection) {
    const photos = inv.receipt_photos || [];
    if (photos.length) {
      photosSection.style.display = '';
      window._invPhotos = photos;
      photosSection.innerHTML = `<div class="inv-label" style="margin-bottom:8px;">Photos</div><div class="receipt-photos-wrap">${photos.map((p, i) => `<img src="${esc(p)}" class="receipt-thumb" onclick="openPhotoLightbox(window._invPhotos,${i})">`).join('')}</div>`;
    } else {
      photosSection.style.display = 'none';
    }
  }

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

  // Store photo arrays by estimate ID for lightbox access
  window._estPhotosMap = {};
  estimates.forEach(est => { if (est.receipt_photos?.length) window._estPhotosMap[est.id] = est.receipt_photos; });

  section.style.display = '';
  list.innerHTML = estimates.map(est => {
    const completion = est.estimated_completion_date
      ? new Date(est.estimated_completion_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : null;
    const statusClass = est.status === 'approved' ? 'est-status-approved' : est.status === 'rejected' ? 'est-status-rejected' : 'est-status-pending';
    const statusLabel = est.status === 'approved' ? 'Approved' : est.status === 'rejected' ? 'Declined' : 'Awaiting Your Response';
    const isPending = est.status === 'pending';
    const dateStr = est.created_at ? new Date(est.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

    const itemRows = (est.items || []).map(item => {
      const hasQty = item.quantity != null && item.unitPrice != null;
      const qtyLabel = hasQty
        ? (item.type === 'hours' ? `${item.quantity} hrs @ $${Number(item.unitPrice).toFixed(2)}` : `×${item.quantity} @ $${Number(item.unitPrice).toFixed(2)}`)
        : '';
      const disc = Math.min(Number(item.discount) || 0, Number(item.cost));
      const discRow = disc > 0 ? `<div class="est-item-expl" style="color:#059669;">✓ Courtesy discount: -$${disc.toFixed(2)}</div>` : '';
      return `<div class="est-item-row">
        <div class="est-item-info">
          <div class="est-item-desc">${esc(item.description)}${item.type === 'hours' ? ' <span class="item-type-tag">hourly</span>' : ''}</div>
          ${qtyLabel ? `<div class="est-item-expl" style="color:var(--gray-400);">${qtyLabel}</div>` : ''}
          ${discRow}
          ${item.explanation ? `<div class="est-item-expl">${esc(item.explanation)}</div>` : ''}
          ${item.estimatedDays ? `<div class="est-item-days">Est. ${item.estimatedDays} day${Number(item.estimatedDays) !== 1 ? 's' : ''}</div>` : ''}
        </div>
        <div class="est-item-cost">$${Number(item.cost).toFixed(2)}</div>
      </div>`;
    }).join('');

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

        ${est.deposit_amount ? `<div style="margin:14px 0;padding:14px 16px;background:#eff6ff;border-radius:10px;border:1px solid #bfdbfe;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#1e40af;margin-bottom:4px;">Deposit Required to Start</div>
          <div style="font-size:24px;font-weight:800;color:#1a56db;">$${Number(est.deposit_amount).toFixed(2)}</div>
          <div style="font-size:12px;color:#3730a3;margin-top:2px;">Due upon approval of this estimate</div>
        </div>` : ''}

        ${est.notes ? `<div class="est-notes">${esc(est.notes)}</div>` : ''}

        ${(est.receipt_photos?.length) ? `<div style="margin-bottom:12px;"><div class="est-big-label" style="margin-bottom:6px;">Photos</div><div class="receipt-photos-wrap">${(est.receipt_photos || []).map((p, i) => `<img src="${esc(p)}" class="receipt-thumb" onclick="openPhotoLightbox(window._estPhotosMap['${est.id}'],${i})">`).join('')}</div></div>` : ''}

        ${isPending ? `
        <div class="est-actions">
          <button class="btn est-btn-approve" onclick="estimateAction('${est.id}', 'approve')">✓ Approve</button>
          <button class="btn est-btn-reject" onclick="estimateAction('${est.id}', 'reject')">✗ Decline</button>
          <button class="btn est-btn-question" onclick="toggleMsgForm('${est.id}')">? Ask a Question</button>
        </div>` : ''}

        ${est.deposit_payment_link && !est.deposit_paid ? `
        <div class="deposit-pay-section">
          <div class="deposit-pay-label">Deposit Requested</div>
          <div class="deposit-pay-amount">$${Number(est.deposit_amount).toFixed(2)}</div>
          <a href="${esc(est.deposit_payment_link)}" class="deposit-pay-btn" target="_blank">Pay Deposit Now</a>
          <p style="font-size:12px;color:#3730a3;margin:10px 0 0;">Secure payment powered by Square</p>
        </div>` : ''}
        ${est.deposit_paid ? `<div style="margin:12px 0;"><span class="deposit-paid-notice">✓ Deposit of $${Number(est.deposit_amount).toFixed(2)} received — thank you!</span></div>` : ''}

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

// ── Photo Lightbox ────────────────────────────────────────────────────────────

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

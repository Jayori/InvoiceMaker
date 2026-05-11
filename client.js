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

// ── Client Dashboard ──────────────────────────────────────────────────────────

let clientPasscode = '';

function showProfile(client, invoices, estimates, justPaid, passcode) {
  clientPasscode = passcode || '';
  document.getElementById('passcode-view').style.display = 'none';
  document.getElementById('invoice-view').style.display = 'none';

  // Store data globally
  window._estimatesData = {};
  window._estPhotosMap = {};
  window._invPhotosMap = {};
  estimates.forEach(est => {
    window._estimatesData[est.id] = est;
    if (est.receipt_photos?.length) window._estPhotosMap[est.id] = est.receipt_photos;
  });
  invoices.forEach(inv => {
    if (inv.receipt_photos?.length) window._invPhotosMap[inv.id] = inv.receipt_photos;
  });

  // Hide client-wrap and override body layout so cdash fills the viewport cleanly
  const wrap = document.querySelector('.client-wrap');
  if (wrap) wrap.style.display = 'none';
  document.body.classList.add('has-cdash');

  const dash = document.getElementById('client-dash');
  if (!dash) return;
  dash.style.display = 'flex';

  // Greeting
  const greetEl = document.getElementById('cdash-greeting');
  if (greetEl) greetEl.textContent = `Hello, ${client.name}`;

  // Nav badges
  const unpaid = invoices.filter(i => i.status !== 'paid');
  const pending = estimates.filter(e => e.status === 'pending');
  const invBadge = document.getElementById('cnav-inv-badge');
  const estBadge = document.getElementById('cnav-est-badge');
  if (unpaid.length) { invBadge.textContent = unpaid.length; invBadge.style.display = ''; }
  if (pending.length) { estBadge.textContent = pending.length; estBadge.style.display = ''; }

  // Build all three tabs
  buildDashHome(invoices, estimates, justPaid);

  const invList = document.getElementById('cdash-inv-list');
  invList.innerHTML = invoices.length
    ? buildInvoiceListByAddress(invoices, justPaid)
    : '<p class="cdash-empty">No invoices yet.</p>';

  const estList = document.getElementById('cdash-est-list');
  estList.innerHTML = estimates.length
    ? estimates.map(est => buildEstimateRow(est)).join('')
    : '<p class="cdash-empty">No estimates yet.</p>';
}

function buildDashHome(invoices, estimates, justPaid) {
  const container = document.getElementById('cdash-home-content');
  const depositDue = estimates.filter(e => e.status === 'approved' && e.deposit_amount && !e.deposit_paid);
  const pendingEsts = estimates.filter(e => e.status === 'pending');
  const unpaidInvs = invoices.filter(i => i.status !== 'paid');

  if (!depositDue.length && !pendingEsts.length && !unpaidInvs.length) {
    container.innerHTML = `<div class="cdash-all-clear">
      <div class="cdash-check">&#10003;</div>
      <div class="cdash-all-clear-title">You're all caught up!</div>
      <div class="cdash-all-clear-sub">No pending invoices or estimates right now.</div>
    </div>`;
    return;
  }

  let html = '';
  if (depositDue.length) {
    html += `<div class="cdash-section-label">Deposit Due</div>`;
    html += depositDue.map(est => buildEstimateRow(est)).join('');
  }
  if (pendingEsts.length) {
    html += `<div class="cdash-section-label">Awaiting Your Response</div>`;
    html += pendingEsts.map(est => buildEstimateRow(est)).join('');
  }
  if (unpaidInvs.length) {
    html += buildInvoiceListByAddress(unpaidInvs, justPaid, 'Invoices Due');
  }
  container.innerHTML = html;
}

function cdashTab(name, btn) {
  document.querySelectorAll('.cdash-tab').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.cdash-nav-item').forEach(n => n.classList.remove('active'));
  const tab = document.getElementById(`cdash-${name}`);
  if (tab) tab.style.display = '';
  if (btn) btn.classList.add('active');
  else document.getElementById(`cnav-${name}`)?.classList.add('active');
  const scroll = document.getElementById('cdash-scroll');
  if (scroll) scroll.scrollTop = 0;
}

// ── Profile row builders ──────────────────────────────────────────────────────

function toggleProfileRow(type, id) {
  const detail = document.getElementById(`profile-${type}-detail-${id}`);
  const row = document.getElementById(`profile-${type}-row-${id}`);
  if (!detail) return;
  const isOpen = detail.style.display !== 'none';
  detail.style.display = isOpen ? 'none' : '';
  if (row) row.classList.toggle('is-open', !isOpen);
}

function buildEstimateRow(est) {
  const statusClass = est.status === 'approved' ? 'est-status-approved' : est.status === 'rejected' ? 'est-status-rejected' : 'est-status-pending';
  const statusLabel = est.status === 'approved' ? 'Approved' : est.status === 'rejected' ? 'Declined' : 'Awaiting Response';
  const dateStr = est.created_at ? new Date(est.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  let depositSummaryHtml = '';
  if (est.status === 'approved' && est.deposit_amount) {
    if (est.deposit_payment_link && !est.deposit_paid) {
      depositSummaryHtml = `<a href="${esc(est.deposit_payment_link)}" class="profile-deposit-btn" onclick="event.stopPropagation()" target="_blank">Pay $${Number(est.deposit_amount).toFixed(2)} Deposit</a>`;
    } else if (!est.deposit_paid) {
      depositSummaryHtml = `<span class="profile-deposit-pending">Deposit $${Number(est.deposit_amount).toFixed(2)} pending</span>`;
    } else {
      depositSummaryHtml = `<span class="profile-deposit-paid-badge">Deposit Paid</span>`;
    }
  }

  return `
    <div class="profile-row" id="profile-est-row-${est.id}">
      <div class="profile-row-summary" onclick="toggleProfileRow('est', '${est.id}')">
        <div class="profile-row-left">
          <div class="profile-row-num">${esc(est.estimate_number)}</div>
          <div class="profile-row-date">${dateStr}</div>
        </div>
        <div class="profile-row-right">
          <div class="profile-row-amount">$${Number(est.total).toFixed(2)}</div>
          <span class="est-status-badge ${statusClass}">${statusLabel}</span>
          ${depositSummaryHtml}
        </div>
        <span class="profile-row-chevron">&#9660;</span>
      </div>
      <div id="profile-est-detail-${est.id}" class="profile-row-detail" style="display:none;">
        ${buildEstimateDetailHtml(est)}
      </div>
    </div>`;
}

function buildEstimateDetailHtml(est) {
  const completion = est.estimated_completion_date
    ? new Date(est.estimated_completion_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  const isPending = est.status === 'pending';

  const itemRows = (est.items || []).map(item => {
    const hasQty = item.quantity != null && item.unitPrice != null;
    const qtyLabel = hasQty
      ? (item.type === 'hours' ? `${item.quantity} hrs @ $${Number(item.unitPrice).toFixed(2)}` : `×${item.quantity} @ $${Number(item.unitPrice).toFixed(2)}`)
      : '';
    const disc = Math.min(Number(item.discount) || 0, Number(item.cost));
    const discRow = disc > 0 ? `<div class="est-item-expl" style="color:#059669;">&#10003; Courtesy discount: -$${disc.toFixed(2)}</div>` : '';
    const depPct = Number(item.depositPct) || 0;
    const depLine = depPct > 0 ? `<div class="est-item-expl" style="color:#1a56db;">${depPct}% deposit &#8594; $${(Number(item.cost) * depPct / 100).toFixed(2)}</div>` : '';
    return `<div class="est-item-row">
      <div class="est-item-info">
        <div class="est-item-desc">${esc(item.description)}${item.type === 'hours' ? ' <span class="item-type-tag">hourly</span>' : ''}</div>
        ${qtyLabel ? `<div class="est-item-expl" style="color:var(--gray-400);">${qtyLabel}</div>` : ''}
        ${discRow}${depLine}
        ${item.explanation ? `<div class="est-item-expl">${esc(item.explanation)}</div>` : ''}
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
          <div class="chat-bubble-meta">${m.sender === 'client' ? 'You' : 'Business'} &middot; ${new Date(m.created_at).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}</div>
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

  const photosHtml = est.receipt_photos?.length
    ? `<div style="margin-bottom:12px;"><div class="est-big-label" style="margin-bottom:6px;">Photos</div><div class="receipt-photos-wrap">${est.receipt_photos.map((p, i) => `<img src="${esc(p)}" class="receipt-thumb" onclick="openPhotoLightbox(window._estPhotosMap['${est.id}'],${i})">`).join('')}</div></div>`
    : '';

  // Deposit block — only show when approved (pending estimates show deposit in summary badge only)
  let depositBoxHtml = '';
  if (est.status === 'approved' && est.deposit_amount) {
    if (est.deposit_paid) {
      depositBoxHtml = `<div style="margin:12px 0;"><span class="deposit-paid-notice">&#10003; Deposit of $${Number(est.deposit_amount).toFixed(2)} received &mdash; thank you!</span></div>`;
    } else if (est.deposit_payment_link) {
      depositBoxHtml = `<div class="deposit-pay-section" style="text-align:center;" id="deposit-box-${est.id}">
        <div class="deposit-pay-label">Deposit Required to Start</div>
        <div class="deposit-pay-amount">$${Number(est.deposit_amount).toFixed(2)}</div>
        <a href="${esc(est.deposit_payment_link)}" class="deposit-pay-btn" target="_blank">Complete Deposit &rarr;</a>
        <p style="font-size:12px;color:#3730a3;margin:10px 0 0;">Secure payment powered by Square</p>
      </div>`;
    } else {
      depositBoxHtml = `<div style="margin:14px 0;padding:14px 16px;background:#eff6ff;border-radius:10px;border:1px solid #bfdbfe;" id="deposit-box-${est.id}">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#1e40af;margin-bottom:4px;">Deposit Required to Start</div>
        <div style="font-size:24px;font-weight:800;color:#1a56db;">$${Number(est.deposit_amount).toFixed(2)}</div>
        <div style="font-size:12px;color:#3730a3;margin-top:4px;">Your contractor will send a secure payment link shortly.</div>
      </div>`;
    }
  }

  return `
    <div class="est-items">${itemRows}</div>
    ${est.tax_rate > 0 ? `
      <div class="est-subtotal-row"><span>Subtotal</span><span>$${Number(est.subtotal).toFixed(2)}</span></div>
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
    ${depositBoxHtml}
    ${est.notes ? `<div class="est-notes">${esc(est.notes)}</div>` : ''}
    ${photosHtml}

    ${est.scheduling_mode === 'manager' && est.scheduled_at ? `
    <div class="scheduled-time-badge">
      &#128197; Scheduled: ${new Date(est.scheduled_at).toLocaleString('en-US', { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}
    </div>` : ''}

    ${isPending && est.scheduling_mode === 'client' ? `
    <div class="slot-picker-section" id="slot-picker-${est.id}">
      <div class="slot-picker-title">&#128197; Choose Your Appointment Time</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input type="date" id="slot-date-${est.id}" min="${new Date().toISOString().split('T')[0]}" style="padding:8px 10px;border:1px solid #bbf7d0;border-radius:7px;font-size:14px;">
        <button class="btn btn-sm" style="background:#16a34a;color:#fff;border:none;" onclick="fetchSlots('${est.id}')">Check Availability</button>
      </div>
      <div id="slot-list-${est.id}" class="slot-grid"></div>
      <div id="slot-selected-${est.id}" class="selected-slot-display" style="display:none;"></div>
    </div>` : ''}

    ${isPending ? `
    <div class="est-actions" id="est-actions-${est.id}">
      <button class="btn est-btn-approve" onclick="${est.scheduling_mode === 'client' ? `approveWithSlot('${est.id}')` : `estimateAction('${est.id}', 'approve')`}">&#10003; Approve</button>
      <button class="btn est-btn-reject" onclick="estimateAction('${est.id}', 'reject')">&#10007; Decline</button>
      <button class="btn est-btn-question" onclick="toggleMsgForm('${est.id}')">? Ask a Question</button>
    </div>` : ''}
    ${chatHtml}
    ${msgFormHtml}
  `;
}

function getAddressLabel(inv) {
  return [inv.client_address, inv.client_city, inv.client_state, inv.client_zip].filter(Boolean).join(', ');
}

function buildInvoiceListByAddress(invoices, justPaid, sectionLabel) {
  const groups = {}, order = [];
  invoices.forEach(inv => {
    const addr = getAddressLabel(inv) || 'Other';
    if (!groups[addr]) { groups[addr] = []; order.push(addr); }
    groups[addr].push(inv);
  });
  const multiAddr = order.length > 1;
  let html = '';
  if (sectionLabel) html += `<div class="cdash-section-label">${sectionLabel}</div>`;
  order.forEach(addr => {
    if (multiAddr) html += `<div class="cdash-address-label">${esc(addr)}</div>`;
    html += groups[addr].map(inv => buildInvoiceRow(inv, justPaid)).join('');
  });
  return html;
}

function buildInvoiceRow(inv, justPaid) {
  const isPaid = inv.status === 'paid' || justPaid;
  const isPartial = !isPaid && inv.status === 'partial';
  const statusClass = isPaid ? 'inv-status-paid' : isPartial ? 'inv-status-partial' : 'inv-status-pending';
  const statusLabel = isPaid ? 'Paid' : isPartial ? 'Partial' : 'Unpaid';
  const dateStr = inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const amtPaid = Number(inv.amount_paid || 0);
  const remaining = (Number(inv.total) - amtPaid).toFixed(2);
  const payBtnHtml = isPaid ? '' : isPartial
    ? `<button onclick="event.stopPropagation();payRemaining('${inv.id}','${esc(clientPasscode)}',${remaining})" style="display:inline-block;padding:6px 14px;background:#1a56db;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">Pay $${remaining}</button>`
    : (inv.square_payment_link ? `<a href="${esc(inv.square_payment_link)}" class="profile-pay-btn" onclick="event.stopPropagation()" target="_blank">Pay Now</a>` : '');

  return `
    <div class="profile-row" id="profile-inv-row-${inv.id}">
      <div class="profile-row-summary" onclick="toggleProfileRow('inv', '${inv.id}')">
        <div class="profile-row-left">
          <div class="profile-row-num">${esc(inv.invoice_number)}</div>
          <div class="profile-row-date">${dateStr}</div>
        </div>
        <div class="profile-row-right">
          <div class="profile-row-amount">$${Number(inv.total).toFixed(2)}</div>
          <span class="inv-status-badge ${statusClass}">${statusLabel}</span>
          ${payBtnHtml}
        </div>
        <span class="profile-row-chevron">&#9660;</span>
      </div>
      <div id="profile-inv-detail-${inv.id}" class="profile-row-detail" style="display:none;">
        ${buildInvoiceDetailHtml(inv, isPaid)}
      </div>
    </div>`;
}

function buildInvoiceDetailHtml(inv, isPaid) {
  const dated = {}, undated = [];
  (inv.items || []).forEach(item => {
    if (item.workDate) {
      if (!dated[item.workDate]) dated[item.workDate] = [];
      dated[item.workDate].push(item);
    } else {
      undated.push(item);
    }
  });

  function buildItemHtml(item) {
    const lineTotal = item.quantity * item.unitPrice;
    const disc = Math.min(Number(item.discount) || 0, lineTotal);
    const netTotal = lineTotal - disc;
    const qtyLabel = item.type === 'hours' ? `${item.quantity} hrs` : `x${item.quantity}`;
    return `<div class="est-item-row">
      <div class="est-item-info">
        <div class="est-item-desc">${esc(item.description)}${item.type === 'hours' ? ' <span class="item-type-tag">hourly</span>' : ''}</div>
        <div class="est-item-expl" style="color:var(--gray-400);">${qtyLabel} @ $${Number(item.unitPrice).toFixed(2)}</div>
        ${disc > 0 ? `<div class="est-item-expl" style="color:#059669;">&#10003; Courtesy discount: -$${disc.toFixed(2)}</div>` : ''}
      </div>
      <div class="est-item-cost">$${netTotal.toFixed(2)}</div>
    </div>`;
  }

  let itemsHtml = undated.map(buildItemHtml).join('');
  Object.keys(dated).sort().forEach(date => {
    const dateStr = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    itemsHtml += `<div class="work-date-header">${esc(dateStr)}</div>`;
    itemsHtml += dated[date].map(buildItemHtml).join('');
  });

  const dueStr = inv.due_date
    ? new Date(inv.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Upon receipt';

  const photosHtml = (inv.receipt_photos || []).length
    ? `<div style="margin-top:16px;"><div class="est-big-label" style="margin-bottom:6px;">Photos</div><div class="receipt-photos-wrap">${(inv.receipt_photos || []).map((p, i) => {
        if (!window._invPhotosMap) window._invPhotosMap = {};
        window._invPhotosMap[inv.id] = inv.receipt_photos;
        return `<img src="${esc(p)}" class="receipt-thumb" onclick="openPhotoLightbox(window._invPhotosMap['${inv.id}'],${i})">`;
      }).join('')}</div></div>`
    : '';

  return `
    <div style="padding-top:8px;">
      <div class="inv-meta" style="margin-bottom:12px;">
        <div><span class="inv-label">Due</span><span class="inv-val">${dueStr}</span></div>
      </div>
      <div class="est-items">${itemsHtml}</div>
      <div style="margin-top:8px;">
        <div class="est-subtotal-row"><span>Subtotal</span><span>$${Number(inv.subtotal).toFixed(2)}</span></div>
        ${inv.tax_rate > 0 ? `<div class="est-subtotal-row"><span>Tax (${inv.tax_rate}%)</span><span>$${Number(inv.tax_amount).toFixed(2)}</span></div>` : ''}
        <div class="est-subtotal-row" style="font-weight:700;font-size:16px;padding-top:6px;border-top:2px solid var(--gray-200);margin-top:4px;color:var(--gray-900);"><span>Total</span><span>$${Number(inv.total).toFixed(2)}</span></div>
      </div>
      ${inv.notes ? `<div class="est-notes" style="margin-top:12px;">${esc(inv.notes)}</div>` : ''}
      ${photosHtml}
      ${buildInvPaySection(inv, isPaid)}
    </div>`;
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

// Slot picker state
const _selectedSlots = {};

async function fetchSlots(estimateId) {
  const dateInput = document.getElementById(`slot-date-${estimateId}`);
  const listEl = document.getElementById(`slot-list-${estimateId}`);
  if (!dateInput?.value) { alert('Please pick a date first.'); return; }
  listEl.innerHTML = '<span style="font-size:13px;color:#15803d;">Checking availability...</span>';
  try {
    const res = await fetch(`/api/get-available-slots?date=${dateInput.value}`);
    const data = await res.json();
    if (!data.connected) {
      listEl.innerHTML = '<span style="font-size:13px;color:#dc2626;">Calendar not connected yet. The business will schedule your appointment.</span>';
      return;
    }
    if (!data.slots?.length) {
      listEl.innerHTML = '<span style="font-size:13px;color:#6b7280;">No available slots on this date. Try another day.</span>';
      return;
    }
    listEl.innerHTML = data.slots.map(s =>
      `<button class="slot-btn" onclick="selectSlot('${estimateId}', '${s.iso}', '${s.label}', this)">${s.label}</button>`
    ).join('');
  } catch {
    listEl.innerHTML = '<span style="font-size:13px;color:#dc2626;">Failed to load slots. Please try again.</span>';
  }
}

function selectSlot(estimateId, iso, label, btn) {
  document.querySelectorAll(`#slot-list-${estimateId} .slot-btn`).forEach(b => b.classList.remove('slot-selected'));
  btn.classList.add('slot-selected');
  _selectedSlots[estimateId] = { scheduledAt: iso, label };
  const display = document.getElementById(`slot-selected-${estimateId}`);
  if (display) { display.textContent = `Selected: ${label}`; display.style.display = ''; }
}

async function approveWithSlot(estimateId) {
  const slot = _selectedSlots[estimateId];
  if (!slot) { alert('Please select a time slot before approving.'); return; }
  if (!confirm(`Approve this estimate and book ${slot.label}?`)) return;
  await estimateAction(estimateId, 'approve', slot);
}

async function estimateAction(estimateId, action, slotData) {
  if (!slotData) {
    const word = action === 'approve' ? 'approve' : 'decline';
    if (!confirm(`Are you sure you want to ${word} this estimate?`)) return;
  }

  try {
    const body = { estimateId, passcode: clientPasscode, action };
    if (slotData) { body.scheduledAt = slotData.scheduledAt; }
    const res = await fetch('/api/estimate-action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Failed'); return; }

    const row = document.getElementById(`profile-est-row-${estimateId}`);

    // Update status badge in summary row
    const badge = row?.querySelector('.est-status-badge');
    if (badge) {
      if (action === 'approve') { badge.textContent = 'Approved'; badge.className = 'est-status-badge est-status-approved'; }
      else { badge.textContent = 'Declined'; badge.className = 'est-status-badge est-status-rejected'; }
    }

    // Remove action buttons, replace with deposit button or nothing
    const actions = document.getElementById(`est-actions-${estimateId}`);
    const msgForm = document.getElementById(`msg-form-${estimateId}`);

    if (action === 'approve') {
      const estData = window._estimatesData?.[estimateId];
      const depositLink = data.deposit_payment_link;
      const depositAmt = estData?.deposit_amount;

      // Remove action buttons
      if (actions) actions.remove();
      if (msgForm) msgForm.remove();

      // Show deposit block where the actions were (or append to detail)
      const detail = document.getElementById(`profile-est-detail-${estimateId}`);
      if (depositAmt && detail) {
        const existingBox = document.getElementById(`deposit-box-${estimateId}`);
        const depositHtml = depositLink
          ? `<div class="deposit-pay-section" style="text-align:center;" id="deposit-box-${estimateId}">
              <div class="deposit-pay-label">Deposit Required to Start</div>
              <div class="deposit-pay-amount">$${Number(depositAmt).toFixed(2)}</div>
              <a href="${esc(depositLink)}" class="deposit-pay-btn" target="_blank">Complete Deposit &rarr;</a>
              <p style="font-size:12px;color:#3730a3;margin:10px 0 0;">Secure payment powered by Square</p>
            </div>`
          : `<div style="margin:14px 0;padding:14px 16px;background:#eff6ff;border-radius:10px;border:1px solid #bfdbfe;" id="deposit-box-${estimateId}">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#1e40af;margin-bottom:4px;">Deposit Required to Start</div>
              <div style="font-size:22px;font-weight:800;color:#1a56db;">$${Number(depositAmt).toFixed(2)}</div>
              <div style="font-size:12px;color:#3730a3;margin-top:4px;">Your contractor will send a secure payment link shortly.</div>
            </div>`;
        if (existingBox) {
          existingBox.outerHTML = depositHtml;
        } else {
          detail.insertAdjacentHTML('beforeend', depositHtml);
        }

        // Update summary row badge
        const rightDiv = row?.querySelector('.profile-row-right');
        if (rightDiv) {
          const existing = rightDiv.querySelector('.profile-deposit-pending, .profile-deposit-btn');
          if (existing) existing.remove();
          if (depositLink) {
            const a = document.createElement('a');
            a.href = depositLink; a.target = '_blank'; a.className = 'profile-deposit-btn';
            a.textContent = `Pay $${Number(depositAmt).toFixed(2)} Deposit`;
            a.onclick = e => e.stopPropagation();
            rightDiv.appendChild(a);
          } else {
            const span = document.createElement('span');
            span.className = 'profile-deposit-pending';
            span.textContent = `Deposit $${Number(depositAmt).toFixed(2)} pending`;
            rightDiv.appendChild(span);
          }
        }
      }
    } else {
      if (actions) actions.remove();
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

// ── Partial payment helpers ───────────────────────────────────────────────────

function buildInvPaySection(inv, isPaid) {
  if (isPaid) return `<div class="paid-notice" style="margin-top:16px;">Payment received &mdash; thank you!</div>`;

  const amtPaid = Number(inv.amount_paid || 0);
  const isPartial = inv.status === 'partial';
  const remaining = (Number(inv.total) - amtPaid).toFixed(2);
  const canPay = inv.square_payment_link || isPartial;
  if (!canPay) return '';

  const progressHtml = isPartial ? `
    <div class="partial-summary">
      <div class="partial-summary-label">Partial Payment Received</div>
      <div class="partial-summary-row"><span>Amount paid</span><span class="partial-summary-paid">$${amtPaid.toFixed(2)}</span></div>
      <div class="partial-summary-row partial-summary-balance"><span>Remaining balance</span><span>$${remaining}</span></div>
    </div>` : '';

  const primaryBtn = isPartial
    ? `<button id="pay-remaining-${inv.id}" onclick="payRemaining('${inv.id}','${esc(clientPasscode)}',${remaining})" class="btn btn-primary btn-block btn-pay">Pay Remaining $${remaining} &rarr;</button>`
    : `<a href="${esc(inv.square_payment_link)}" class="btn btn-primary btn-block btn-pay" target="_blank">Pay Now &rarr;</a>`;

  return `
    ${progressHtml}
    <div style="margin-top:${isPartial ? '12px' : '20px'};text-align:center;">
      ${primaryBtn}
      <button type="button" onclick="openPartialPayForm('${inv.id}')" class="btn btn-primary btn-block btn-pay" style="margin-top:10px;">Pay Partial</button>
      <p style="margin:10px 0 0;font-size:12px;color:var(--gray-400);">Secure payment powered by Square</p>
    </div>
    <div id="partial-form-${inv.id}" style="display:none;margin-top:16px;padding:16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px;">How much would you like to pay now?</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span style="font-size:15px;color:var(--gray-400);">$</span>
        <input type="number" id="partial-amount-${inv.id}" placeholder="0.00" min="0.01" max="${remaining}" step="0.01" style="flex:1;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:15px;">
        <button onclick="submitPartialPayment('${inv.id}','${esc(clientPasscode)}')" class="btn btn-primary" style="white-space:nowrap;">Confirm Amount</button>
      </div>
      <div id="partial-redirect-${inv.id}" style="display:none;margin-top:12px;padding:12px 14px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;text-align:center;font-size:13px;color:#1e40af;font-weight:500;">
        <span class="spinner" style="margin-right:6px;"></span>Redirecting to Square secure payments&hellip;
      </div>
      <div id="partial-error-${inv.id}" style="color:#dc2626;font-size:13px;margin-top:8px;display:none;"></div>
    </div>`;
}

function openPartialPayForm(invId) {
  const form = document.getElementById(`partial-form-${invId}`);
  if (form) form.style.display = form.style.display === 'none' ? '' : 'none';
}

async function submitPartialPayment(invId, passcode) {
  const input = document.getElementById(`partial-amount-${invId}`);
  const errEl = document.getElementById(`partial-error-${invId}`);
  const amount = parseFloat(input?.value);
  if (errEl) errEl.style.display = 'none';
  if (!amount || amount <= 0) {
    if (errEl) { errEl.textContent = 'Please enter a valid amount.'; errEl.style.display = ''; }
    return;
  }
  const btn = document.querySelector(`#partial-form-${invId} .btn-primary`);
  const redirectEl = document.getElementById(`partial-redirect-${invId}`);
  if (btn) { btn.disabled = true; btn.textContent = 'Confirming...'; }
  try {
    const res = await fetch('/api/create-partial-payment', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId: invId, amount, passcode }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (errEl) { errEl.textContent = data.error || 'Failed to create payment link.'; errEl.style.display = ''; }
      if (btn) { btn.disabled = false; btn.textContent = 'Confirm Amount'; }
      return;
    }
    if (btn) btn.style.display = 'none';
    if (redirectEl) redirectEl.style.display = '';
    setTimeout(() => { window.location.href = data.paymentLink; }, 1200);
  } catch {
    if (errEl) { errEl.textContent = 'Something went wrong. Please try again.'; errEl.style.display = ''; }
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm Amount'; }
  }
}

async function payRemaining(invId, passcode, amount) {
  const btn = document.getElementById(`pay-remaining-${invId}`);
  if (btn) { btn.disabled = true; btn.textContent = 'Loading...'; }
  try {
    const res = await fetch('/api/create-partial-payment', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId: invId, amount, passcode }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    window.location.href = data.paymentLink;
  } catch (err) {
    alert(err.message || 'Failed to create payment link.');
    if (btn) { btn.disabled = false; btn.textContent = `Pay Remaining $${amount} →`; }
  }
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

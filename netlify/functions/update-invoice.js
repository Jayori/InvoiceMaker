const { SquareClient, SquareEnvironment } = require('square');
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { sendSms } = require('./send-sms');

const square = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
});
const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { invoiceId, clientName, clientEmail, clientPhone, clientCompany, clientAddress, clientCity, clientState, clientZip, items, taxRate = 0, notes, dueDate, receiptPhotos, resendEmail, resendSms, businessProfileId } = body;
  if (!invoiceId || !clientName || !clientEmail || !items?.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invoiceId, clientName, clientEmail, and items required' }) };
  }

  const { data: existing, error: fetchErr } = await supabase.from('invoices').select('*').eq('id', invoiceId).single();
  if (fetchErr || !existing) return { statusCode: 404, body: JSON.stringify({ error: 'Invoice not found' }) };

  const normalizedEmail = clientEmail.toLowerCase().trim();

  // Recalculate totals (respecting discounts)
  const subtotal = items.reduce((s, i) => {
    const lineTotal = i.quantity * i.unitPrice;
    const disc = Math.min(Number(i.discount) || 0, lineTotal);
    return s + lineTotal - disc;
  }, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  // Regenerate Square link if total or email changed
  const totalChanged = Math.abs(total - Number(existing.total)) > 0.01;
  const emailChanged = normalizedEmail !== existing.client_email;
  let squarePaymentLink = existing.square_payment_link;
  let squareOrderId = existing.square_order_id;

  if (totalChanged || emailChanged) {
    const { data: clientRow } = await supabase.from('clients').select('passcode').eq('email', normalizedEmail).maybeSingle();
    const passcode = clientRow?.passcode || existing.passcode;
    try {
      const lineItems = items.map(item => {
        const lt = item.quantity * item.unitPrice;
        const disc = Math.min(Number(item.discount) || 0, lt);
        const net = lt - disc;
        if (disc > 0) return { name: item.description.substring(0, 100), quantity: '1', basePriceMoney: { amount: BigInt(Math.round(net * 100)), currency: 'USD' } };
        return { name: item.description.substring(0, 100), quantity: String(item.quantity), basePriceMoney: { amount: BigInt(Math.round(item.unitPrice * 100)), currency: 'USD' } };
      });
      if (taxRate > 0) lineItems.push({ name: `Tax (${taxRate}%)`, quantity: '1', basePriceMoney: { amount: BigInt(Math.round(taxAmount * 100)), currency: 'USD' } });
      const result = await square.checkout.paymentLinks.create({
        idempotencyKey: crypto.randomUUID(),
        order: { locationId: process.env.SQUARE_LOCATION_ID, referenceId: existing.invoice_number, lineItems },
        checkoutOptions: { redirectUrl: `${process.env.APP_URL}/client.html?paid=${passcode}` },
      });
      squarePaymentLink = result.paymentLink.url;
      squareOrderId = result.paymentLink.orderId;
    } catch (err) {
      const detail = err.errors ? JSON.stringify(err.errors) : (err.message || String(err));
      return { statusCode: 502, body: JSON.stringify({ error: 'Square error', detail }) };
    }
  }

  // Build DB update
  const update = {
    client_name: clientName,
    client_email: normalizedEmail,
    client_phone: clientPhone || null,
    client_company: clientCompany || null,
    client_address: clientAddress || null,
    client_city: clientCity || null,
    client_state: clientState || null,
    client_zip: clientZip || null,
    items,
    subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total,
    notes: notes || null,
    due_date: dueDate || null,
    square_payment_link: squarePaymentLink,
    square_order_id: squareOrderId,
  };
  if (receiptPhotos !== undefined) update.receipt_photos = receiptPhotos?.length ? receiptPhotos : null;

  if (businessProfileId !== undefined) update.business_profile_id = businessProfileId || null;

  const { data: invoice, error: dbError } = await supabase.from('invoices').update(update).eq('id', invoiceId).select().single();
  if (dbError) return { statusCode: 502, body: JSON.stringify({ error: dbError.message }) };

  // Resend email if requested

  if (resendEmail) {
    let business = {};
    const bpId = businessProfileId || existing.business_profile_id;
    if (bpId) {
      const { data } = await supabase.from('business_profiles').select('*').eq('id', bpId).single();
      if (data) business = data;
    }
    if (!business.name) {
      const { data } = await supabase.from('business_profile').select('*').eq('id', 1).single();
      if (data) business = data;
    }
    const { data: clientRow } = await supabase.from('clients').select('passcode').eq('email', normalizedEmail).maybeSingle();
    const passcode = clientRow?.passcode || existing.passcode;
    try {
      await resend.emails.send({
        from: process.env.FROM_EMAIL,
        to: normalizedEmail,
        subject: `Updated Invoice from ${business?.name || 'Us'} — $${total.toFixed(2)} due`,
        html: buildEmail({ invoiceNumber: existing.invoice_number, passcode, clientName, clientAddress, clientCity, clientState, clientZip, business: business || {}, items, subtotal, taxRate, taxAmount, total, dueDate, notes, paymentLink: squarePaymentLink }),
      });
    } catch (err) { console.error('Resend error:', err); }

    if (resendSms && clientPhone) {
      const appUrl = process.env.APP_URL || '';
      const msg = `Updated invoice from ${business?.name || 'Us'}: $${total.toFixed(2)} due. View & pay at ${appUrl}/client.html — Code: ${passcode}`;
      const smsResult = await sendSms(clientPhone, msg);
      if (!smsResult.success) console.error('SMS error:', smsResult.error);
    }
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoice) };
};

function buildEmail({ invoiceNumber, passcode, clientName, clientAddress, clientCity, clientState, clientZip, business, items, subtotal, taxRate, taxAmount, total, dueDate, notes, paymentLink }) {
  const appUrl = process.env.APP_URL || '';
  const dueDateStr = dueDate ? new Date(dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Upon receipt';

  const dated = {}, undated = [];
  items.forEach(item => {
    if (item.workDate) { if (!dated[item.workDate]) dated[item.workDate] = []; dated[item.workDate].push(item); }
    else undated.push(item);
  });

  function buildRow(item) {
    const lt = item.quantity * item.unitPrice;
    const disc = Math.min(Number(item.discount) || 0, lt);
    const net = lt - disc;
    const qtyLabel = item.type === 'hours' ? `${item.quantity} hrs` : `x${item.quantity}`;
    const discHtml = disc > 0 ? `<div style="font-size:11px;color:#059669;margin-top:2px;">Courtesy discount: -$${disc.toFixed(2)}</div>` : '';
    const rateHtml = disc > 0 ? `<span style="text-decoration:line-through;color:#9ca3af;font-size:12px;">$${Number(item.unitPrice).toFixed(2)}</span>` : `$${Number(item.unitPrice).toFixed(2)}`;
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escHtml(item.description)}${item.type === 'hours' ? ' <span style="font-size:11px;color:#6b7280;">(hourly)</span>' : ''}${discHtml}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;color:#6b7280;">${qtyLabel}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${rateHtml}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:500;">$${net.toFixed(2)}</td>
    </tr>`;
  }

  let itemRows = undated.map(buildRow).join('');
  Object.keys(dated).sort().forEach(date => {
    const ds = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    itemRows += `<tr><td colspan="4" style="padding:10px 12px 4px;background:#f9fafb;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;border-top:1px solid #e5e7eb;">Work: ${escHtml(ds)}</td></tr>`;
    itemRows += dated[date].map(buildRow).join('');
  });

  const businessBlock = [business.name, business.address, [business.city, business.state, business.zip].filter(Boolean).join(', '), business.phone, business.email]
    .filter(Boolean).map(l => `<div>${escHtml(l)}</div>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr><td style="background:#1a56db;padding:28px 40px;">
    <h1 style="margin:0;color:#fff;font-size:26px;font-weight:700;">${escHtml(business.name || 'Invoice')}</h1>
    <p style="margin:4px 0 0;color:#bfdbfe;font-size:14px;">Invoice ${escHtml(invoiceNumber)} (Updated)</p>
  </td></tr>
  <tr><td style="padding:28px 40px 0;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:top;width:33%;"><p style="margin:0 0 6px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">From</p><div style="font-size:13px;color:#374151;line-height:1.6;">${businessBlock}</div></td>
      <td style="vertical-align:top;width:33%;padding-left:20px;"><p style="margin:0 0 6px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Billed To</p><div style="font-size:13px;color:#374151;line-height:1.6;"><div style="font-weight:600;font-size:15px;color:#111827;">${escHtml(clientName)}</div>${clientAddress ? `<div>${escHtml(clientAddress)}</div>` : ''}${[clientCity,clientState,clientZip].filter(Boolean).length ? `<div>${escHtml([clientCity,clientState,clientZip].filter(Boolean).join(', '))}</div>` : ''}</div></td>
      <td style="vertical-align:top;width:33%;text-align:right;"><p style="margin:0 0 6px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Due Date</p><p style="margin:0;font-size:15px;font-weight:600;color:#111827;">${dueDateStr}</p></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:24px 40px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead><tr style="background:#f9fafb;">
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Description</th>
        <th style="padding:10px 12px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Qty</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Rate</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Total</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
  </td></tr>
  <tr><td style="padding:16px 40px 0;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td width="55%"></td><td>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;color:#6b7280;font-size:14px;">Subtotal</td><td style="text-align:right;font-size:14px;">$${Number(subtotal).toFixed(2)}</td></tr>
        ${taxRate > 0 ? `<tr><td style="padding:5px 0;color:#6b7280;font-size:14px;">Tax (${taxRate}%)</td><td style="text-align:right;font-size:14px;">$${Number(taxAmount).toFixed(2)}</td></tr>` : ''}
        <tr><td style="padding:10px 0 0;border-top:2px solid #e5e7eb;font-weight:700;font-size:18px;color:#111827;">Total Due</td>
            <td style="padding:10px 0 0;border-top:2px solid #e5e7eb;text-align:right;font-weight:700;font-size:18px;color:#1a56db;">$${Number(total).toFixed(2)}</td></tr>
      </table>
    </td></tr></table>
  </td></tr>
  ${notes ? `<tr><td style="padding:20px 40px 0;"><p style="margin:0 0 4px;color:#6b7280;font-size:11px;text-transform:uppercase;">Notes</p><p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${escHtml(notes)}</p></td></tr>` : ''}
  <tr><td style="padding:28px 40px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;">
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 4px;color:#1e40af;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Your Access Code</p>
        <p style="margin:0 0 8px;font-size:32px;font-weight:700;letter-spacing:0.15em;color:#1a56db;font-family:monospace;">${escHtml(passcode)}</p>
        <p style="margin:0;color:#3730a3;font-size:13px;">Visit <a href="${appUrl}/client.html" style="color:#1a56db;">${appUrl}/client.html</a> and enter this code to view all your invoices.</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:28px 40px;" align="center">
    <a href="${paymentLink}" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:14px 40px;border-radius:6px;font-size:16px;font-weight:600;">Pay Now — $${Number(total).toFixed(2)}</a>
  </td></tr>
  <tr><td style="padding:0 40px 28px;text-align:center;"><p style="margin:0;color:#9ca3af;font-size:12px;">Secure payment powered by Square</p></td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

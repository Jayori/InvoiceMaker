const { SquareClient, SquareEnvironment } = require('square');
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { sendSms } = require('./send-sms');
const { createCalendarEvent } = require('./gcal-client');
const { getSmsTemplate, renderTemplate } = require('./sms-templates');

const square = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
});
const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  return `INV-${year}-${Math.floor(Math.random() * 9000) + 1000}`;
}

function generatePasscode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildEmail({ invoiceNumber, passcode, clientName, clientAddress, clientCity, clientState, clientZip, business, items, subtotal, taxRate, taxAmount, total, dueDate, notes, paymentLink }) {
  const appUrl = process.env.APP_URL || '';
  const dueDateStr = dueDate
    ? new Date(dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Upon receipt';

  // Group items by workDate
  const dated = {}, undated = [];
  items.forEach(item => {
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
    const discountHtml = disc > 0 ? `<div style="font-size:11px;color:#059669;margin-top:2px;">Courtesy discount: -$${disc.toFixed(2)}</div>` : '';
    const rateHtml = disc > 0
      ? `<span style="text-decoration:line-through;color:#9ca3af;font-size:12px;">$${Number(item.unitPrice).toFixed(2)}</span>`
      : `$${Number(item.unitPrice).toFixed(2)}`;
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">
          ${escHtml(item.description)}${item.type === 'hours' ? ' <span style="font-size:11px;color:#6b7280;">(hourly)</span>' : ''}
          ${discountHtml}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;color:#6b7280;">${qtyLabel}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${rateHtml}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:500;">$${netTotal.toFixed(2)}</td>
      </tr>`;
  }

  let itemRows = undated.map(buildItemRow).join('');
  Object.keys(dated).sort().forEach(date => {
    const dateStr = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    itemRows += `<tr><td colspan="4" style="padding:10px 12px 4px;background:#f9fafb;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;border-top:1px solid #e5e7eb;">Work: ${escHtml(dateStr)}</td></tr>`;
    itemRows += dated[date].map(buildItemRow).join('');
  });

  const businessBlock = [
    business.name,
    business.address,
    [business.city, business.state, business.zip].filter(Boolean).join(', '),
    business.phone,
    business.email,
  ].filter(Boolean).map(l => `<div>${escHtml(l)}</div>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr><td style="background:#1a56db;padding:28px 40px;">
    <h1 style="margin:0;color:#fff;font-size:26px;font-weight:700;">${escHtml(business.name || 'Invoice')}</h1>
    <p style="margin:4px 0 0;color:#bfdbfe;font-size:14px;">Invoice ${escHtml(invoiceNumber)}</p>
  </td></tr>

  <!-- From / To / Due -->
  <tr><td style="padding:28px 40px 0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:top;width:33%;">
          <p style="margin:0 0 6px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">From</p>
          <div style="font-size:13px;color:#374151;line-height:1.6;">${businessBlock}</div>
        </td>
        <td style="vertical-align:top;width:33%;padding-left:20px;">
          <p style="margin:0 0 6px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Billed To</p>
          <div style="font-size:13px;color:#374151;line-height:1.6;">
            <div style="font-weight:600;font-size:15px;color:#111827;">${escHtml(clientName)}</div>
            ${clientAddress ? `<div>${escHtml(clientAddress)}</div>` : ''}
            ${[clientCity, clientState, clientZip].filter(Boolean).length ? `<div>${escHtml([clientCity, clientState, clientZip].filter(Boolean).join(', '))}</div>` : ''}
          </div>
        </td>
        <td style="vertical-align:top;width:33%;text-align:right;">
          <p style="margin:0 0 6px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Due Date</p>
          <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">${dueDateStr}</p>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Items -->
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

  <!-- Totals -->
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

  <!-- Passcode box -->
  <tr><td style="padding:28px 40px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;">
      <tr><td style="padding:20px 24px;text-align:center;">
        <p style="margin:0 0 4px;color:#1e40af;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Your Access Code</p>
        <p style="margin:0 0 4px;font-size:36px;font-weight:700;letter-spacing:0.2em;color:#1a56db;font-family:monospace;">${escHtml(passcode)}</p>
        <p style="margin:0;color:#3730a3;font-size:12px;">Use this code on the InvoiceMePro site — same code for all your invoices</p>
      </td></tr>
    </table>
  </td></tr>

  <!-- View Invoice button -->
  <tr><td style="padding:24px 40px 0;" align="center">
    <a href="${appUrl}/client.html" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:16px 48px;border-radius:8px;font-size:18px;font-weight:700;letter-spacing:0.01em;font-family:Arial,sans-serif;">View Invoice &rarr;</a>
  </td></tr>

  <tr><td style="padding:12px 40px 28px;text-align:center;">
    <p style="margin:0;color:#9ca3af;font-size:12px;">View your invoice and pay securely online</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { clientName, clientEmail, clientPhone, clientCompany, clientAddress, clientCity, clientState, clientZip, items, taxRate = 0, notes, dueDate, sendEmail = true, sendSmsNotification, receiptPhotos, businessProfileId, scheduledAt, scheduledDuration, coClients } = body;
  if (!clientName || !clientEmail || !items?.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'clientName, clientEmail, and at least one item are required' }) };
  }

  const subtotal = items.reduce((s, i) => {
    const lineTotal = i.quantity * i.unitPrice;
    // Only cap discount on positive items (negative items = credits)
    const disc = lineTotal > 0 ? Math.min(Number(i.discount) || 0, lineTotal) : 0;
    return s + lineTotal - disc;
  }, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  const invoiceNumber = generateInvoiceNumber();

  // Find or create client to get their permanent passcode
  const normalizedEmail = clientEmail.toLowerCase().trim();
  const { data: existingClient } = await supabase
    .from('clients').select('id, passcode').eq('email', normalizedEmail).maybeSingle();

  let passcode;
  if (existingClient?.passcode) {
    passcode = existingClient.passcode;
  } else {
    passcode = generatePasscode();
    if (existingClient) {
      await supabase.from('clients').update({ passcode }).eq('id', existingClient.id);
    } else {
      await supabase.from('clients').insert({ name: clientName, email: normalizedEmail, passcode });
    }
  }

  // Fetch business profile
  let business = {};
  if (businessProfileId) {
    const { data } = await supabase.from('business_profiles').select('*').eq('id', businessProfileId).single();
    if (data) business = data;
  }
  if (!business.name) {
    const { data } = await supabase.from('business_profile').select('*').eq('id', 1).single();
    if (data) business = data;
  }

  // Create Square payment link (skip if fully covered by deposit)
  let squarePaymentLink = null, squareOrderId = null;
  const netTotal = total;
  if (netTotal <= 0) {
    // Fully covered — save as paid immediately, no Square link needed
    const { data: invoice, error: dbError } = await supabase
      .from('invoices')
      .insert({ invoice_number: invoiceNumber, passcode, client_name: clientName, client_email: clientEmail, client_phone: clientPhone || null, client_company: clientCompany || null, client_address: clientAddress || null, client_city: clientCity || null, client_state: clientState || null, client_zip: clientZip || null, items, subtotal, tax_rate: taxRate, tax_amount: taxAmount, total: 0, notes: notes || null, due_date: dueDate || null, square_payment_link: null, square_order_id: null, receipt_photos: receiptPhotos?.length ? receiptPhotos : null, business_profile_id: businessProfileId || null, status: 'paid', paid_at: new Date().toISOString(), co_clients: coClients?.length ? coClients : [] })
      .select().single();
    if (dbError) return { statusCode: 502, body: JSON.stringify({ error: 'Failed to save invoice', detail: dbError.message }) };
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoice) };
  }
  try {
    const lineItems = items.map(item => {
      const lineTotal = item.quantity * item.unitPrice;
      const disc = lineTotal > 0 ? Math.min(Number(item.discount) || 0, lineTotal) : 0;
      const netTotal = lineTotal - disc;
      // Skip zero or negative items (deposit credits) from Square — they're in the invoice record only
      if (netTotal <= 0) return null;
      // If discounted, collapse to qty=1 at net price; otherwise keep original qty+rate
      if (disc > 0) {
        return { name: item.description.substring(0, 100), quantity: '1', basePriceMoney: { amount: BigInt(Math.round(netTotal * 100)), currency: 'USD' } };
      }
      return { name: item.description.substring(0, 100), quantity: String(item.quantity), basePriceMoney: { amount: BigInt(Math.round(item.unitPrice * 100)), currency: 'USD' } };
    }).filter(Boolean);
    if (taxRate > 0) {
      lineItems.push({ name: `Tax (${taxRate}%)`, quantity: '1', basePriceMoney: { amount: BigInt(Math.round(taxAmount * 100)), currency: 'USD' } });
    }
    const paymentLinkResult = await square.checkout.paymentLinks.create({
      idempotencyKey: crypto.randomUUID(),
      order: { locationId: process.env.SQUARE_LOCATION_ID, referenceId: invoiceNumber, lineItems },
      checkoutOptions: { redirectUrl: `${process.env.APP_URL}/client.html?paid=${passcode}` },
    });
    squarePaymentLink = paymentLinkResult.paymentLink.url;
    squareOrderId = paymentLinkResult.paymentLink.orderId;
  } catch (err) {
    console.error('Square error:', err);
    const detail = err.errors ? JSON.stringify(err.errors) : (err.message || String(err));
    return { statusCode: 502, body: JSON.stringify({ error: 'Square error', detail }) };
  }

  // Resolve passcodes for co-clients (look up or create their client records)
  const resolvedCoClients = [];
  for (const cc of (coClients || [])) {
    if (!cc.email) continue;
    const ccEmail = cc.email.toLowerCase().trim();
    const { data: ccClient } = await supabase.from('clients').select('id, passcode').eq('email', ccEmail).maybeSingle();
    let ccPasscode;
    if (ccClient?.passcode) {
      ccPasscode = ccClient.passcode;
    } else {
      ccPasscode = generatePasscode();
      if (ccClient) {
        await supabase.from('clients').update({ passcode: ccPasscode }).eq('id', ccClient.id);
      } else {
        await supabase.from('clients').insert({ name: cc.name || ccEmail, email: ccEmail, passcode: ccPasscode });
      }
    }
    resolvedCoClients.push({ name: cc.name || '', email: ccEmail, passcode: ccPasscode });
  }

  // Save to Supabase
  const { data: invoice, error: dbError } = await supabase
    .from('invoices')
    .insert({ invoice_number: invoiceNumber, passcode, client_name: clientName, client_email: clientEmail, client_phone: clientPhone || null, client_company: clientCompany || null, client_address: clientAddress || null, client_city: clientCity || null, client_state: clientState || null, client_zip: clientZip || null, items, subtotal, tax_rate: taxRate, tax_amount: taxAmount, total, notes: notes || null, due_date: dueDate || null, square_payment_link: squarePaymentLink, square_order_id: squareOrderId, receipt_photos: receiptPhotos?.length ? receiptPhotos : null, business_profile_id: businessProfileId || null, scheduled_at: scheduledAt || null, scheduled_duration: scheduledDuration || null, co_clients: resolvedCoClients.length ? resolvedCoClients : [] })
    .select().single();

  if (dbError) return { statusCode: 502, body: JSON.stringify({ error: 'Failed to save invoice', detail: dbError.message }) };

  // Book Google Calendar event if a time was scheduled
  if (scheduledAt) {
    try {
      const eventId = await createCalendarEvent({
        title: `Invoice — ${clientName}`,
        description: `Invoice ${invoiceNumber}\n$${Number(total).toFixed(2)}`,
        scheduledAt,
        durationMins: scheduledDuration || 60,
      });
      await supabase.from('invoices').update({ gcal_event_id: eventId }).eq('id', invoice.id);
    } catch (err) {
      console.error('Google Calendar event creation failed (non-fatal):', err.message);
    }
  }

  // Send email if requested
  if (sendEmail) {
    try {
      await resend.emails.send({
        from: process.env.FROM_EMAIL,
        to: clientEmail,
        subject: `Invoice from ${business?.name || 'Us'} — $${total.toFixed(2)} due`,
        html: buildEmail({ invoiceNumber, passcode, clientName, clientAddress, clientCity, clientState, clientZip, business: business || {}, items, subtotal, taxRate, taxAmount, total, dueDate, notes, paymentLink: squarePaymentLink }),
      });
    } catch (err) { console.error('Resend error:', err); }
  }

  // Send emails to co-clients (each with their own passcode)
  if (sendEmail && resolvedCoClients.length) {
    for (const cc of resolvedCoClients) {
      try {
        await resend.emails.send({
          from: process.env.FROM_EMAIL,
          to: cc.email,
          subject: `Invoice from ${business?.name || 'Us'} — $${total.toFixed(2)} due`,
          html: buildEmail({ invoiceNumber, passcode: cc.passcode, clientName: cc.name || cc.email, clientAddress, clientCity, clientState, clientZip, business: business || {}, items, subtotal, taxRate, taxAmount, total, dueDate, notes, paymentLink: squarePaymentLink }),
        });
      } catch (err) { console.error('Co-client email error:', err); }
    }
  }

  // Send SMS if requested and phone provided
  if (sendSmsNotification && clientPhone) {
    const appUrl = process.env.APP_URL || '';
    const template = await getSmsTemplate(supabase, 'invoice_new');
    const msg = renderTemplate(template, {
      bizName: business?.name || 'Us',
      clientName,
      amount: total.toFixed(2),
      passcode,
      link: `${appUrl}/client.html`,
    });
    const smsResult = await sendSms(clientPhone, msg);
    if (!smsResult.success) console.error('SMS error:', smsResult.error);
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoice) };
};

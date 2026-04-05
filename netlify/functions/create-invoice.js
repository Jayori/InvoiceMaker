const { SquareClient, SquareEnvironment } = require('square');
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

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

function buildEmail({ invoiceNumber, passcode, clientName, business, items, subtotal, taxRate, taxAmount, total, dueDate, notes, paymentLink }) {
  const appUrl = process.env.APP_URL || '';
  const dueDateStr = dueDate
    ? new Date(dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Upon receipt';

  const itemRows = items.map(item => {
    const lineTotal = (item.quantity * item.unitPrice).toFixed(2);
    const qtyLabel = item.type === 'hours' ? `${item.quantity} hrs` : `x${item.quantity}`;
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escHtml(item.description)}${item.type === 'hours' ? ' <span style="font-size:11px;color:#6b7280;">(hourly)</span>' : ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;color:#6b7280;">${qtyLabel}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">$${Number(item.unitPrice).toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:500;">$${lineTotal}</td>
      </tr>`;
  }).join('');

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
          <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">${escHtml(clientName)}</p>
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
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 4px;color:#1e40af;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Your Access Code</p>
        <p style="margin:0 0 8px;font-size:32px;font-weight:700;letter-spacing:0.15em;color:#1a56db;font-family:monospace;">${escHtml(passcode)}</p>
        <p style="margin:0;color:#3730a3;font-size:13px;">Visit <a href="${appUrl}/client.html" style="color:#1a56db;">${appUrl}/client.html</a> and enter this code to view all your invoices. This code stays the same for all future invoices.</p>
      </td></tr>
    </table>
  </td></tr>

  <!-- Pay button -->
  <tr><td style="padding:28px 40px;" align="center">
    <a href="${paymentLink}" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:14px 40px;border-radius:6px;font-size:16px;font-weight:600;">Pay Now — $${Number(total).toFixed(2)}</a>
  </td></tr>

  <tr><td style="padding:0 40px 28px;text-align:center;">
    <p style="margin:0;color:#9ca3af;font-size:12px;">Secure payment powered by Square</p>
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

  const { clientName, clientEmail, items, taxRate = 0, notes, dueDate } = body;
  if (!clientName || !clientEmail || !items?.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'clientName, clientEmail, and at least one item are required' }) };
  }

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
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
  const { data: business = {} } = await supabase.from('business_profile').select('*').eq('id', 1).single();

  // Create Square payment link
  let squarePaymentLink = null, squareOrderId = null;
  try {
    const lineItems = items.map(item => ({
      name: item.description.substring(0, 100),
      quantity: String(item.quantity),
      basePriceMoney: { amount: BigInt(Math.round(item.unitPrice * 100)), currency: 'USD' },
    }));
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

  // Save to Supabase
  const { data: invoice, error: dbError } = await supabase
    .from('invoices')
    .insert({ invoice_number: invoiceNumber, passcode, client_name: clientName, client_email: clientEmail, items, subtotal, tax_rate: taxRate, tax_amount: taxAmount, total, notes: notes || null, due_date: dueDate || null, square_payment_link: squarePaymentLink, square_order_id: squareOrderId })
    .select().single();

  if (dbError) return { statusCode: 502, body: JSON.stringify({ error: 'Failed to save invoice', detail: dbError.message }) };

  // Send email
  try {
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: clientEmail,
      subject: `Invoice from ${business?.name || 'Us'} — $${total.toFixed(2)} due`,
      html: buildEmail({ invoiceNumber, passcode, clientName, business: business || {}, items, subtotal, taxRate, taxAmount, total, dueDate, notes, paymentLink: squarePaymentLink }),
    });
  } catch (err) { console.error('Resend error:', err); }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoice) };
};

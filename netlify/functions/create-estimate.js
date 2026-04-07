const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const { sendSms } = require('./send-sms');

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function generateEstimateNumber() {
  const year = new Date().getFullYear();
  return `EST-${year}-${Math.floor(Math.random() * 9000) + 1000}`;
}

function generatePasscode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { clientName, clientEmail, clientPhone, clientCompany, clientAddress, clientCity, clientState, clientZip, items, taxRate = 0, notes, sendEmail = true, sendSmsNotification, receiptPhotos, businessProfileId, depositAmount } = body;
  if (!clientName || !clientEmail || !items?.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'clientName, clientEmail, and items required' }) };
  }

  const subtotal = items.reduce((s, i) => s + (Number(i.cost) || 0), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  // Completion date = latest end date across all items
  const itemDates = items.map(i => i.completionDate).filter(Boolean).sort();
  const estimatedCompletionDate = itemDates.length ? itemDates[itemDates.length - 1] : null;

  const estimateNumber = generateEstimateNumber();

  // Find or create client for permanent passcode
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

  const { data: estimate, error } = await supabase
    .from('estimates')
    .insert({
      estimate_number: estimateNumber,
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
      estimated_completion_date: estimatedCompletionDate,
      notes: notes || null,
      receipt_photos: receiptPhotos?.length ? receiptPhotos : null,
      business_profile_id: businessProfileId || null,
      deposit_amount: depositAmount || null,
    })
    .select().single();

  if (error) return { statusCode: 502, body: JSON.stringify({ error: error.message }) };

  let business = {};
  if (businessProfileId) {
    const { data } = await supabase.from('business_profiles').select('*').eq('id', businessProfileId).single();
    if (data) business = data;
  }
  if (!business.name) {
    const { data } = await supabase.from('business_profile').select('*').eq('id', 1).single();
    if (data) business = data;
  }
  const appUrl = process.env.APP_URL || '';

  if (sendEmail) {
    try {
      await resend.emails.send({
        from: process.env.FROM_EMAIL,
        to: clientEmail,
        subject: `Estimate from ${business?.name || 'Us'} — $${total.toFixed(2)}`,
        html: buildEstimateEmail({ estimate, passcode, business: business || {}, appUrl }),
      });
    } catch (err) { console.error('Resend error:', err); }
  }

  // Send SMS if requested and phone provided
  if (sendSmsNotification && clientPhone) {
    const bizName = business?.name || 'Us';
    const msg = `Estimate from ${bizName}: $${total.toFixed(2)}. View & respond at ${appUrl}/client.html — Code: ${passcode}`;
    const smsResult = await sendSms(clientPhone, msg);
    if (!smsResult.success) console.error('SMS error:', smsResult.error);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...estimate, passcode }),
  };
};

function buildEstimateEmail({ estimate, passcode, business, appUrl }) {
  const completionStr = estimate.estimated_completion_date
    ? new Date(estimate.estimated_completion_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const businessBlock = [
    business.name,
    business.address,
    [business.city, business.state, business.zip].filter(Boolean).join(', '),
    business.phone,
    business.email,
  ].filter(Boolean).map(l => `<div>${escHtml(l)}</div>`).join('');

  const itemRows = estimate.items.map(item => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;vertical-align:top;">
        <div style="font-weight:600;color:#111827;">${escHtml(item.description)}</div>
        ${item.explanation ? `<div style="font-size:12px;color:#6b7280;margin-top:4px;line-height:1.5;">${escHtml(item.explanation)}</div>` : ''}
        ${item.estimatedDays ? `<div style="font-size:11px;color:#9ca3af;margin-top:3px;">Est. ${item.estimatedDays} day${Number(item.estimatedDays) !== 1 ? 's' : ''}</div>` : ''}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;white-space:nowrap;vertical-align:top;">$${Number(item.cost).toFixed(2)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

  <tr><td style="background:#0f766e;padding:28px 40px;">
    <h1 style="margin:0;color:#fff;font-size:26px;font-weight:700;">${escHtml(business.name || 'Estimate')}</h1>
    <p style="margin:4px 0 0;color:#99f6e4;font-size:14px;">Estimate ${escHtml(estimate.estimate_number)}</p>
  </td></tr>

  <tr><td style="padding:28px 40px 0;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:top;width:50%;">
        <p style="margin:0 0 6px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">From</p>
        <div style="font-size:13px;color:#374151;line-height:1.6;">${businessBlock}</div>
      </td>
      <td style="vertical-align:top;width:50%;text-align:right;">
        <p style="margin:0 0 6px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Prepared For</p>
        <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">${escHtml(estimate.client_name)}</p>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:24px 40px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead><tr style="background:#f9fafb;">
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Item</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Cost</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
  </td></tr>

  <tr><td style="padding:16px 40px 0;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%"></td><td>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:5px 0;color:#6b7280;font-size:14px;">Subtotal</td><td style="text-align:right;font-size:14px;">$${Number(estimate.subtotal).toFixed(2)}</td></tr>
        ${estimate.tax_rate > 0 ? `<tr><td style="padding:5px 0;color:#6b7280;font-size:14px;">Tax (${estimate.tax_rate}%)</td><td style="text-align:right;font-size:14px;">$${Number(estimate.tax_amount).toFixed(2)}</td></tr>` : ''}
        <tr><td style="padding:10px 0 0;border-top:2px solid #e5e7eb;font-weight:700;font-size:20px;color:#111827;">Total Estimate</td>
            <td style="padding:10px 0 0;border-top:2px solid #e5e7eb;text-align:right;font-weight:700;font-size:20px;color:#0f766e;">$${Number(estimate.total).toFixed(2)}</td></tr>
      </table>
    </td></tr></table>
  </td></tr>

  ${completionStr ? `
  <tr><td style="padding:24px 40px 0;text-align:center;">
    <p style="margin:0 0 4px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Estimated Completion</p>
    <p style="margin:0;font-size:22px;font-weight:700;color:#111827;">${completionStr}</p>
  </td></tr>` : ''}

  ${estimate.notes ? `<tr><td style="padding:20px 40px 0;"><p style="margin:0 0 4px;color:#6b7280;font-size:11px;text-transform:uppercase;">Notes</p><p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${escHtml(estimate.notes)}</p></td></tr>` : ''}

  <tr><td style="padding:28px 40px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;">
      <tr><td style="padding:20px 24px;text-align:center;">
        <p style="margin:0 0 4px;color:#15803d;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Your Access Code</p>
        <p style="margin:0 0 4px;font-size:36px;font-weight:700;letter-spacing:0.2em;color:#16a34a;font-family:monospace;">${escHtml(passcode)}</p>
        <p style="margin:0 0 0;color:#166534;font-size:12px;">Use this code on the InvoiceMePro site to view your estimate</p>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:24px 40px 0;" align="center">
    <a href="${appUrl}/client.html" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:16px 48px;border-radius:8px;font-size:18px;font-weight:700;letter-spacing:0.01em;font-family:Arial,sans-serif;">View Estimate &rarr;</a>
  </td></tr>

  <tr><td style="padding:16px 40px 28px;text-align:center;">
    <p style="margin:0;color:#9ca3af;font-size:12px;">View, approve, ask questions, or decline — no payment due until you approve.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

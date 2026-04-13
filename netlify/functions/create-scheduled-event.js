const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const { sendSms } = require('./send-sms');
const { createCalendarEvent } = require('./gcal-client');
const { getSmsTemplate, renderTemplate } = require('./sms-templates');

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function buildConfirmEmail({ clientName, scheduledAt, durationMins, serviceCall, notes, business, isReschedule }) {
  const appUrl = process.env.APP_URL || '';
  const dateStr = formatDateTime(scheduledAt);
  const subject = isReschedule ? 'rescheduled' : 'scheduled';
  const scLine = serviceCall?.amount
    ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Service Call Fee</td><td style="text-align:right;font-size:14px;font-weight:600;color:#111827;">$${Number(serviceCall.amount).toFixed(2)}</td></tr>`
    : '';
  const notesLine = notes
    ? `<div style="margin-top:20px;padding:14px 18px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;"><div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Notes</div><div style="font-size:14px;color:#374151;">${escHtml(notes)}</div></div>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr><td style="background:#0f766e;padding:28px 36px;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${escHtml(business.name || 'Appointment')}</h1>
    <p style="margin:6px 0 0;color:#99f6e4;font-size:14px;">Your appointment has been ${escHtml(subject)}</p>
  </td></tr>
  <tr><td style="padding:28px 36px 0;">
    <p style="margin:0 0 20px;font-size:15px;color:#374151;">Hi ${escHtml(clientName)},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;">Your appointment with <strong>${escHtml(business.name || 'us')}</strong> has been ${escHtml(subject)}.</p>
    <div style="background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;padding:20px 24px;margin-bottom:20px;">
      <div style="font-size:11px;color:#15803d;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;margin-bottom:8px;">Appointment Details</div>
      <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:4px;">${escHtml(dateStr)}</div>
      <div style="font-size:14px;color:#6b7280;">${durationMins >= 60 ? (durationMins / 60) + ' hour' + (durationMins > 60 ? 's' : '') : durationMins + ' min'}</div>
    </div>
    ${scLine ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">${scLine}</table>` : ''}
    ${notesLine}
  </td></tr>
  <tr><td style="padding:24px 36px 32px;text-align:center;">
    <p style="margin:0 0 16px;font-size:13px;color:#9ca3af;">Questions? Contact ${escHtml(business.phone || business.email || 'us')} or view your invoices at:</p>
    <a href="${appUrl}/client.html" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:700;">View My Account →</a>
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

  const { clientName, clientEmail, clientPhone, scheduledAt, durationMins = 60, serviceCall, notes, sendNotifications = true } = body;
  if (!clientName || !clientEmail || !scheduledAt) {
    return { statusCode: 400, body: JSON.stringify({ error: 'clientName, clientEmail, and scheduledAt are required' }) };
  }

  // Fetch business profile
  const { data: business = {} } = await supabase.from('business_profile').select('*').eq('id', 1).single();

  // Save event
  const { data: evt, error: dbErr } = await supabase
    .from('scheduled_events')
    .insert({ client_name: clientName, client_email: clientEmail, client_phone: clientPhone || '', scheduled_at: scheduledAt, duration_mins: durationMins, service_call: serviceCall || null, notes: notes || null })
    .select().single();

  if (dbErr) return { statusCode: 502, body: JSON.stringify({ error: 'Failed to save event', detail: dbErr.message }) };

  // Create Google Calendar event (non-fatal)
  try {
    const scDesc = serviceCall?.amount ? `\nService Call: $${Number(serviceCall.amount).toFixed(2)}` : '';
    const gcalId = await createCalendarEvent({
      title: `${clientName}`,
      description: `Scheduled appointment${scDesc}${notes ? '\n' + notes : ''}`,
      scheduledAt,
      durationMins,
    });
    await supabase.from('scheduled_events').update({ gcal_event_id: gcalId }).eq('id', evt.id);
    evt.gcal_event_id = gcalId;
  } catch (err) {
    console.error('GCal event creation (non-fatal):', err.message);
  }

  // Send notifications
  if (sendNotifications) {
    const dateStr = formatDateTime(scheduledAt);
    const bizName = business?.name || 'Us';

    // Email
    try {
      await resend.emails.send({
        from: process.env.FROM_EMAIL,
        to: clientEmail,
        subject: `Your appointment with ${bizName} is confirmed`,
        html: buildConfirmEmail({ clientName, scheduledAt, durationMins, serviceCall, notes, business: business || {}, isReschedule: false }),
      });
    } catch (err) { console.error('Resend error:', err); }

    // SMS
    if (clientPhone) {
      const scText = serviceCall?.amount ? ` Service call fee: $${Number(serviceCall.amount).toFixed(2)}.` : '';
      const template = await getSmsTemplate(supabase, 'event_confirm');
      const msg = renderTemplate(template, {
        bizName,
        clientName,
        date: dateStr,
        serviceCall: scText,
        link: `${process.env.APP_URL}/client.html`,
      });
      await sendSms(clientPhone, msg);
    }
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(evt) };
};

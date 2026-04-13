const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const { sendSms } = require('./send-sms');
const { updateCalendarEvent } = require('./gcal-client');
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

function buildRescheduleEmail({ clientName, oldScheduledAt, scheduledAt, durationMins, serviceCall, notes, business }) {
  const appUrl = process.env.APP_URL || '';
  const newDateStr = formatDateTime(scheduledAt);
  const oldDateStr = oldScheduledAt ? formatDateTime(oldScheduledAt) : null;
  const scLine = serviceCall?.amount
    ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Service Call Fee</td><td style="text-align:right;font-size:14px;font-weight:600;color:#111827;">$${Number(serviceCall.amount).toFixed(2)}</td></tr>`
    : '';
  const notesLine = notes
    ? `<div style="margin-top:16px;padding:12px 16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;font-size:14px;color:#374151;">${escHtml(notes)}</div>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr><td style="background:#1a56db;padding:28px 36px;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${escHtml(business.name || 'Appointment')}</h1>
    <p style="margin:6px 0 0;color:#bfdbfe;font-size:14px;">Your appointment has been rescheduled</p>
  </td></tr>
  <tr><td style="padding:28px 36px 0;">
    <p style="margin:0 0 20px;font-size:15px;color:#374151;">Hi ${escHtml(clientName)},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;">Your appointment with <strong>${escHtml(business.name || 'us')}</strong> has been rescheduled.</p>
    ${oldDateStr ? `<div style="padding:14px 18px;background:#fef3c7;border-radius:8px;margin-bottom:12px;font-size:14px;color:#92400e;"><strong>Previous time:</strong> ${escHtml(oldDateStr)}</div>` : ''}
    <div style="background:#eff6ff;border-radius:10px;border:1px solid #bfdbfe;padding:20px 24px;margin-bottom:20px;">
      <div style="font-size:11px;color:#1e40af;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;margin-bottom:8px;">New Appointment Time</div>
      <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:4px;">${escHtml(newDateStr)}</div>
      <div style="font-size:14px;color:#6b7280;">${durationMins >= 60 ? (durationMins / 60) + ' hour' + (durationMins > 60 ? 's' : '') : durationMins + ' min'}</div>
    </div>
    ${scLine ? `<table width="100%" cellpadding="0" cellspacing="0">${scLine}</table>` : ''}
    ${notesLine}
  </td></tr>
  <tr><td style="padding:24px 36px 32px;text-align:center;">
    <a href="${appUrl}/client.html" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:700;">View My Account →</a>
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

  const { id, scheduledAt, durationMins, notes, serviceCall, status, sendNotifications = true } = body;
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'id required' }) };

  // Fetch existing event
  const { data: existing, error: fetchErr } = await supabase
    .from('scheduled_events').select('*').eq('id', id).single();
  if (fetchErr || !existing) return { statusCode: 404, body: JSON.stringify({ error: 'Event not found' }) };

  const oldScheduledAt = existing.scheduled_at;
  const isReschedule = scheduledAt && scheduledAt !== oldScheduledAt;

  // Build update object
  const update = {};
  if (scheduledAt !== undefined) update.scheduled_at = scheduledAt;
  if (durationMins !== undefined) update.duration_mins = durationMins;
  if (notes !== undefined) update.notes = notes;
  if (serviceCall !== undefined) update.service_call = serviceCall;
  if (status !== undefined) update.status = status;
  // Reset reminder flags when rescheduled so they fire again for the new time
  if (isReschedule) { update.reminder_24_sent = false; update.reminder_48_sent = false; }

  const { data: updated, error: updateErr } = await supabase
    .from('scheduled_events').update(update).eq('id', id).select().single();
  if (updateErr) return { statusCode: 502, body: JSON.stringify({ error: updateErr.message }) };

  // Update Google Calendar event (non-fatal)
  if (isReschedule && existing.gcal_event_id) {
    try {
      await updateCalendarEvent(existing.gcal_event_id, {
        title: existing.client_name,
        description: `Rescheduled appointment${notes ? '\n' + notes : ''}`,
        scheduledAt: scheduledAt || oldScheduledAt,
        durationMins: durationMins || existing.duration_mins,
      });
    } catch (err) {
      console.error('GCal update (non-fatal):', err.message);
    }
  }

  // Send reschedule notifications
  if (isReschedule && sendNotifications) {
    const { data: business = {} } = await supabase.from('business_profile').select('*').eq('id', 1).single();
    const bizName = business?.name || 'Us';
    const newDateStr = formatDateTime(scheduledAt);
    const oldDateStr = formatDateTime(oldScheduledAt);

    // Email
    try {
      await resend.emails.send({
        from: process.env.FROM_EMAIL,
        to: existing.client_email,
        subject: `Your appointment with ${bizName} has been rescheduled`,
        html: buildRescheduleEmail({
          clientName: existing.client_name,
          oldScheduledAt,
          scheduledAt,
          durationMins: durationMins || existing.duration_mins,
          serviceCall: serviceCall || existing.service_call,
          notes: notes || existing.notes,
          business: business || {},
        }),
      });
    } catch (err) { console.error('Resend error:', err); }

    // SMS
    if (existing.client_phone) {
      const template = await getSmsTemplate(supabase, 'event_reschedule');
      const msg = renderTemplate(template, {
        bizName,
        clientName: existing.client_name,
        date: newDateStr,
        oldDate: oldDateStr,
      });
      await sendSms(existing.client_phone, msg);
    }
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) };
};

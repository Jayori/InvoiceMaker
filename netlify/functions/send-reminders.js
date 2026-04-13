const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const { sendSms } = require('./send-sms');
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

function buildReminderEmail({ clientName, scheduledAt, durationMins, serviceCall, notes, business, hoursAhead }) {
  const appUrl = process.env.APP_URL || '';
  const dateStr = formatDateTime(scheduledAt);
  const label = hoursAhead === 24 ? 'tomorrow' : 'in 2 days';
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
  <tr><td style="background:#d97706;padding:28px 36px;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${escHtml(business.name || 'Appointment Reminder')}</h1>
    <p style="margin:6px 0 0;color:#fef3c7;font-size:14px;">Your appointment is ${label}</p>
  </td></tr>
  <tr><td style="padding:28px 36px 0;">
    <p style="margin:0 0 20px;font-size:15px;color:#374151;">Hi ${escHtml(clientName)},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;">This is a friendly reminder that your appointment with <strong>${escHtml(business.name || 'us')}</strong> is <strong>${label}</strong>.</p>
    <div style="background:#fffbeb;border-radius:10px;border:1px solid #fcd34d;padding:20px 24px;margin-bottom:20px;">
      <div style="font-size:11px;color:#92400e;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;margin-bottom:8px;">Appointment Details</div>
      <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:4px;">${escHtml(dateStr)}</div>
      <div style="font-size:14px;color:#6b7280;">${durationMins >= 60 ? (durationMins/60) + ' hour' + (durationMins > 60 ? 's' : '') : durationMins + ' min'}</div>
    </div>
    ${scLine ? `<table width="100%" cellpadding="0" cellspacing="0">${scLine}</table>` : ''}
    ${notesLine}
  </td></tr>
  <tr><td style="padding:24px 36px 32px;">
    <p style="margin:0 0 16px;font-size:13px;color:#9ca3af;text-align:center;">Questions? Contact ${escHtml(business.phone || business.email || 'us')}</p>
    <div style="text-align:center;">
      <a href="${appUrl}/client.html" style="display:inline-block;background:#d97706;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:700;">View My Account →</a>
    </div>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

exports.handler = async (event) => {
  const now = new Date();

  // Fetch business profile
  const { data: business } = await supabase.from('business_profile').select('*').eq('id', 1).single();
  const settings = business?.reminder_settings || {};
  const bizName = business?.name || 'Us';

  const results = [];

  // ── 24-hour reminders ──────────────────────────────────────────────────────
  if (settings.h24_email || settings.h24_sms) {
    const winStart = new Date(now.getTime() + 23 * 3600 * 1000).toISOString();
    const winEnd   = new Date(now.getTime() + 25 * 3600 * 1000).toISOString();

    const { data: events24 = [] } = await supabase
      .from('scheduled_events')
      .select('*')
      .gte('scheduled_at', winStart)
      .lte('scheduled_at', winEnd)
      .eq('reminder_24_sent', false)
      .neq('status', 'cancelled');

    for (const evt of events24) {
      const dateStr = formatDateTime(evt.scheduled_at);
      const scText = evt.service_call?.amount ? ` Service call fee: $${Number(evt.service_call.amount).toFixed(2)}.` : '';

      if (settings.h24_email && evt.client_email) {
        try {
          await resend.emails.send({
            from: process.env.FROM_EMAIL,
            to: evt.client_email,
            subject: `Reminder: Your appointment with ${bizName} is tomorrow`,
            html: buildReminderEmail({
              clientName: evt.client_name, scheduledAt: evt.scheduled_at,
              durationMins: evt.duration_mins || 60, serviceCall: evt.service_call,
              notes: evt.notes, business: business || {}, hoursAhead: 24,
            }),
          });
        } catch (err) { console.error('24h email error:', err.message); }
      }

      if (settings.h24_sms && evt.client_phone) {
        const template = await getSmsTemplate(supabase, 'event_reminder_24h');
        const msg = renderTemplate(template, { bizName, clientName: evt.client_name, date: dateStr, serviceCall: scText });
        await sendSms(evt.client_phone, msg);
      }

      await supabase.from('scheduled_events').update({ reminder_24_sent: true }).eq('id', evt.id);
      results.push({ id: evt.id, type: '24h' });
    }
  }

  // ── 48-hour reminders ──────────────────────────────────────────────────────
  if (settings.h48_email || settings.h48_sms) {
    const winStart = new Date(now.getTime() + 47 * 3600 * 1000).toISOString();
    const winEnd   = new Date(now.getTime() + 49 * 3600 * 1000).toISOString();

    const { data: events48 = [] } = await supabase
      .from('scheduled_events')
      .select('*')
      .gte('scheduled_at', winStart)
      .lte('scheduled_at', winEnd)
      .eq('reminder_48_sent', false)
      .neq('status', 'cancelled');

    for (const evt of events48) {
      const dateStr = formatDateTime(evt.scheduled_at);
      const scText = evt.service_call?.amount ? ` Service call fee: $${Number(evt.service_call.amount).toFixed(2)}.` : '';

      if (settings.h48_email && evt.client_email) {
        try {
          await resend.emails.send({
            from: process.env.FROM_EMAIL,
            to: evt.client_email,
            subject: `Reminder: Your appointment with ${bizName} is in 2 days`,
            html: buildReminderEmail({
              clientName: evt.client_name, scheduledAt: evt.scheduled_at,
              durationMins: evt.duration_mins || 60, serviceCall: evt.service_call,
              notes: evt.notes, business: business || {}, hoursAhead: 48,
            }),
          });
        } catch (err) { console.error('48h email error:', err.message); }
      }

      if (settings.h48_sms && evt.client_phone) {
        const template = await getSmsTemplate(supabase, 'event_reminder_48h');
        const msg = renderTemplate(template, { bizName, clientName: evt.client_name, date: dateStr, serviceCall: scText });
        await sendSms(evt.client_phone, msg);
      }

      await supabase.from('scheduled_events').update({ reminder_48_sent: true }).eq('id', evt.id);
      results.push({ id: evt.id, type: '48h' });
    }
  }

  console.log(`send-reminders: ${results.length} reminder(s) sent`, results);
  return { statusCode: 200, body: JSON.stringify({ ok: true, sent: results.length }) };
};

// Shared SMS template helper
// Templates stored in business_profile.sms_templates (JSONB)
// Variables: {bizName} {clientName} {amount} {passcode} {link} {date} {oldDate} {serviceCall}

const DEFAULTS = {
  invoice_new:        'Invoice from {bizName}: ${amount} due. View & pay at {link} — Code: {passcode}',
  invoice_update:     'Updated invoice from {bizName}: ${amount} due. View & pay at {link} — Code: {passcode}',
  estimate_new:       'Estimate from {bizName}: ${amount}. View & respond at {link} — Code: {passcode}',
  estimate_update:    'Updated estimate from {bizName}: ${amount}. View & respond at {link} — Code: {passcode}',
  event_confirm:      '{bizName}: Your appointment is confirmed for {date}.{serviceCall} Questions? Visit {link}',
  event_reschedule:   '{bizName}: Your appointment has been rescheduled from {oldDate} to {date}. Questions? Call/text us.',
  event_reminder_24h: '{bizName}: Reminder — your appointment is tomorrow at {date}.{serviceCall} Questions? Call/text us.',
  event_reminder_48h: '{bizName}: Reminder — your appointment is in 2 days on {date}.{serviceCall} Questions? Call/text us.',
};

function renderTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

async function getSmsTemplate(supabase, key) {
  try {
    const { data } = await supabase
      .from('business_profile')
      .select('sms_templates')
      .eq('id', 1)
      .single();
    const custom = data?.sms_templates?.[key];
    return custom || DEFAULTS[key] || '';
  } catch {
    return DEFAULTS[key] || '';
  }
}

module.exports = { DEFAULTS, renderTemplate, getSmsTemplate };

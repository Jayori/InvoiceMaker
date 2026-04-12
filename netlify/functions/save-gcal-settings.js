const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  let fields;
  try { fields = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  // Only allow updating gcal-related fields
  const allowed = ['gcal_refresh_token', 'gcal_calendar_id', 'work_hours_start', 'work_hours_end', 'work_hours_per_day', 'blocked_days'];
  const update = {};
  for (const key of allowed) {
    if (key in fields) update[key] = fields[key];
  }

  if (!Object.keys(update).length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No valid fields to update' }) };
  }

  const { error } = await supabase.from('business_profile').update(update).eq('id', 1);
  if (error) return { statusCode: 502, body: JSON.stringify({ error: error.message }) };
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
};

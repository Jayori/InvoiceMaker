const { createClient } = require('@supabase/supabase-js');
const { deleteCalendarEvent } = require('./gcal-client');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'DELETE' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { id } = event.queryStringParameters || {};
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'id required' }) };

  // Fetch to get gcal_event_id
  const { data: evt } = await supabase
    .from('scheduled_events').select('gcal_event_id').eq('id', id).single();

  // Delete GCal event (non-fatal)
  if (evt?.gcal_event_id) {
    await deleteCalendarEvent(evt.gcal_event_id);
  }

  const { error } = await supabase.from('scheduled_events').delete().eq('id', id);
  if (error) return { statusCode: 502, body: JSON.stringify({ error: error.message }) };

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
};

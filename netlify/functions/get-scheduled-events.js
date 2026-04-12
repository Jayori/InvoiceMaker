const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  const { status, upcoming } = event.queryStringParameters || {};

  // Standalone scheduled events
  let evtQuery = supabase
    .from('scheduled_events')
    .select('*')
    .order('scheduled_at');

  if (status) {
    evtQuery = evtQuery.eq('status', status);
  } else {
    evtQuery = evtQuery.neq('status', 'cancelled');
  }

  if (upcoming === '1') {
    evtQuery = evtQuery.gte('scheduled_at', new Date().toISOString());
  }

  const [{ data: standalone }, { data: invs }, { data: ests }] = await Promise.all([
    evtQuery,
    supabase.from('invoices')
      .select('id, invoice_number, client_name, scheduled_at, scheduled_duration, status')
      .not('scheduled_at', 'is', null)
      .order('scheduled_at'),
    supabase.from('estimates')
      .select('id, estimate_number, client_name, scheduled_at, scheduled_duration, status')
      .not('scheduled_at', 'is', null)
      .order('scheduled_at'),
  ]);

  const events = [
    ...(standalone || []).map(e => ({ ...e, type: 'event', label: e.client_name })),
    ...(invs || []).map(e => ({ ...e, type: 'invoice', label: e.invoice_number, scheduled_at: e.scheduled_at })),
    ...(ests || []).map(e => ({ ...e, type: 'estimate', label: e.estimate_number, scheduled_at: e.scheduled_at })),
  ].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(events),
  };
};

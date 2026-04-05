const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const { passcode } = JSON.parse(event.body || '{}');
  if (!passcode) return { statusCode: 400, body: JSON.stringify({ error: 'Passcode required' }) };

  const code = passcode.toUpperCase().trim();

  // Primary: look up by client passcode — returns full profile
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('passcode', code)
    .maybeSingle();

  if (client) {
    const [invoicesResult, estimatesResult] = await Promise.all([
      supabase.from('invoices').select('*').eq('client_email', client.email).order('created_at', { ascending: false }),
      supabase.from('estimates').select('*').eq('client_email', client.email).order('created_at', { ascending: false }),
    ]);

    const estimates = estimatesResult.data || [];
    let estimatesWithMessages = estimates;
    if (estimates.length > 0) {
      const { data: allMessages } = await supabase
        .from('estimate_messages')
        .select('*')
        .in('estimate_id', estimates.map(e => e.id))
        .order('created_at');
      estimatesWithMessages = estimates.map(est => ({
        ...est,
        messages: (allMessages || []).filter(m => m.estimate_id === est.id),
      }));
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'profile', client, invoices: invoicesResult.data || [], estimates: estimatesWithMessages }),
    };
  }

  // Fallback: old per-invoice passcode (for invoices created before this update)
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('passcode', code)
    .maybeSingle();

  if (error || !invoice) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Code not found. Check your access code and try again.' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'invoice', ...invoice }),
  };
};

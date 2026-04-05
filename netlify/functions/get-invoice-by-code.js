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
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('client_email', client.email)
      .order('created_at', { ascending: false });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'profile', client, invoices: invoices || [] }),
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

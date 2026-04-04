const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const { passcode } = JSON.parse(event.body || '{}');
  if (!passcode) return { statusCode: 400, body: JSON.stringify({ error: 'Passcode required' }) };

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('passcode', passcode.toUpperCase().trim())
    .single();

  if (error || !data) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Invoice not found. Check your passcode and try again.' }) };
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
};

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { email } = body;
  if (!email) return { statusCode: 400, body: JSON.stringify({ error: 'Email required' }) };

  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, passcode, total, status, due_date, created_at, items, subtotal, tax_rate, tax_amount, notes, square_payment_link, client_name')
    .eq('client_email', email.toLowerCase().trim())
    .order('created_at', { ascending: false });

  if (error) return { statusCode: 502, body: JSON.stringify({ error: error.message }) };
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || []),
  };
};

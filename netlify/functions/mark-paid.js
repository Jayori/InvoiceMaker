const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { id, type = 'invoice' } = body;
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'id required' }) };

  if (type === 'invoice') {
    const { data: inv } = await supabase.from('invoices').select('total').eq('id', id).maybeSingle();
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString(), amount_paid: inv?.total || 0 })
      .eq('id', id);
    if (error) return { statusCode: 502, body: JSON.stringify({ error: error.message }) };
  } else if (type === 'estimate') {
    const { error } = await supabase
      .from('estimates')
      .update({ deposit_paid: true })
      .eq('id', id);
    if (error) return { statusCode: 502, body: JSON.stringify({ error: error.message }) };
  } else {
    return { statusCode: 400, body: JSON.stringify({ error: 'type must be invoice or estimate' }) };
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
};

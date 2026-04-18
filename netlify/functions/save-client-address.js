const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const { email, address, city, state, zip } = JSON.parse(event.body || '{}');
  if (!email || !address) return { statusCode: 400, body: JSON.stringify({ error: 'email and address required' }) };

  const normalized = email.toLowerCase().trim();
  const { data: client } = await supabase.from('clients').select('id, addresses').eq('email', normalized).maybeSingle();
  if (!client) return { statusCode: 404, body: JSON.stringify({ error: 'Client not found' }) };

  const newAddr = { address: address.trim(), city: (city || '').trim(), state: (state || '').trim(), zip: (zip || '').trim() };
  const existing = Array.isArray(client.addresses) ? client.addresses : [];
  const key = [newAddr.address, newAddr.city, newAddr.state, newAddr.zip].join('|').toLowerCase();
  const alreadyExists = existing.some(function(a) { return [a.address, a.city, a.state, a.zip].join('|').toLowerCase() === key; });

  if (!alreadyExists) {
    await supabase.from('clients').update({ addresses: [...existing, newAddr] }).eq('id', client.id);
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
};

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const { id } = JSON.parse(event.body || '{}');
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'id required' }) };
  const { error } = await supabase.from('estimates').delete().eq('id', id);
  if (error) return { statusCode: 502, body: JSON.stringify({ error: error.message }) };
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};

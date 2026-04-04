const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'DELETE') return { statusCode: 405, body: 'Method Not Allowed' };
  const { id } = JSON.parse(event.body || '{}');
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) return { statusCode: 502, body: JSON.stringify({ error: error.message }) };
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};

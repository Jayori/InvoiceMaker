const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const fields = JSON.parse(event.body || '{}');
  const { id, ...rest } = fields;

  let result;
  if (id) {
    result = await supabase.from('clients').update(rest).eq('id', id).select().single();
  } else {
    result = await supabase.from('clients').insert(rest).select().single();
  }

  if (result.error) return { statusCode: 502, body: JSON.stringify({ error: result.error.message }) };
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result.data) };
};

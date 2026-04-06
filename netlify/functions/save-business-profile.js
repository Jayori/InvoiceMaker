const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const fields = JSON.parse(event.body || '{}');
  const { id, ...rest } = fields;

  let data, error;
  if (id) {
    ({ data, error } = await supabase
      .from('business_profiles')
      .update(rest)
      .eq('id', id)
      .select()
      .single());
  } else {
    ({ data, error } = await supabase
      .from('business_profiles')
      .insert(rest)
      .select()
      .single());
  }

  if (error) return { statusCode: 502, body: JSON.stringify({ error: error.message }) };
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
};

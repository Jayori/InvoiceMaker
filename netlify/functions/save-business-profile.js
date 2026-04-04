const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const fields = JSON.parse(event.body || '{}');
  const { data, error } = await supabase
    .from('business_profile')
    .update(fields)
    .eq('id', 1)
    .select()
    .single();
  if (error) return { statusCode: 502, body: JSON.stringify({ error: error.message }) };
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
};

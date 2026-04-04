const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async () => {
  const { data, error } = await supabase.from('clients').select('*').order('name');
  if (error) return { statusCode: 502, body: JSON.stringify({ error: error.message }) };
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
};

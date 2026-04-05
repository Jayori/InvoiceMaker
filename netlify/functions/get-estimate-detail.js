const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const { estimateId } = JSON.parse(event.body || '{}');
  if (!estimateId) return { statusCode: 400, body: JSON.stringify({ error: 'estimateId required' }) };

  const [estResult, msgResult] = await Promise.all([
    supabase.from('estimates').select('*').eq('id', estimateId).single(),
    supabase.from('estimate_messages').select('*').eq('estimate_id', estimateId).order('created_at'),
  ]);

  if (estResult.error) return { statusCode: 404, body: JSON.stringify({ error: 'Estimate not found' }) };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...estResult.data, messages: msgResult.data || [] }),
  };
};

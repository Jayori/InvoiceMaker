const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function generatePasscode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const fields = JSON.parse(event.body || '{}');
  const { id, ...rest } = fields;

  let result;
  if (id) {
    // Editing existing client — never overwrite their passcode
    delete rest.passcode;
    result = await supabase.from('clients').update(rest).eq('id', id).select().single();
  } else {
    // New client — reuse existing invoice/estimate passcode if one exists, else generate
    const normalizedEmail = (rest.email || '').toLowerCase().trim();
    let existingPasscode = null;
    if (normalizedEmail) {
      const { data: inv } = await supabase.from('invoices').select('passcode').eq('client_email', normalizedEmail).not('passcode', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
      existingPasscode = inv?.passcode || null;
      if (!existingPasscode) {
        const { data: est } = await supabase.from('estimates').select('passcode').eq('client_email', normalizedEmail).not('passcode', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
        existingPasscode = est?.passcode || null;
      }
    }
    rest.passcode = existingPasscode || generatePasscode();
    result = await supabase.from('clients').insert(rest).select().single();
  }

  if (result.error) return { statusCode: 502, body: JSON.stringify({ error: result.error.message }) };
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result.data) };
};

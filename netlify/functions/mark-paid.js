const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { id, type = 'invoice', amount } = body;
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'id required' }) };

  try {
    if (type === 'invoice') {
      const { data: inv, error: selectErr } = await supabase
        .from('invoices').select('total, amount_paid').eq('id', id).maybeSingle();

      if (selectErr) {
        const isMissing = selectErr.message?.includes('amount_paid') || selectErr.message?.includes('column');
        return { statusCode: 502, body: JSON.stringify({ error: isMissing
          ? 'SQL migration not run yet. Go to Supabase SQL Editor and run: ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid NUMERIC DEFAULT 0; ALTER TABLE invoices ADD COLUMN IF NOT EXISTS partial_order_ids TEXT[] DEFAULT \'{}\';'
          : selectErr.message }) };
      }

      let update;
      if (amount !== undefined) {
        const partialAmt = parseFloat(amount);
        if (isNaN(partialAmt) || partialAmt <= 0)
          return { statusCode: 400, body: JSON.stringify({ error: 'Invalid amount' }) };
        const currentPaid = parseFloat(inv?.amount_paid) || 0;
        const total = parseFloat(inv?.total) || 0;
        const newPaid = Math.min(+(currentPaid + partialAmt).toFixed(2), total);
        const newStatus = newPaid >= total - 0.01 ? 'paid' : 'partial';
        update = { amount_paid: newPaid, status: newStatus };
        if (newStatus === 'paid') update.paid_at = new Date().toISOString();
      } else {
        update = { status: 'paid', paid_at: new Date().toISOString(), amount_paid: inv?.total || 0 };
      }

      const { error: updateErr } = await supabase.from('invoices').update(update).eq('id', id);
      if (updateErr) {
        const isMissing = updateErr.message?.includes('amount_paid') || updateErr.message?.includes('column');
        return { statusCode: 502, body: JSON.stringify({ error: isMissing
          ? 'SQL migration not run yet. Go to Supabase SQL Editor and run: ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid NUMERIC DEFAULT 0; ALTER TABLE invoices ADD COLUMN IF NOT EXISTS partial_order_ids TEXT[] DEFAULT \'{}\';'
          : updateErr.message }) };
      }

    } else if (type === 'estimate') {
      const { error } = await supabase.from('estimates').update({ deposit_paid: true }).eq('id', id);
      if (error) return { statusCode: 502, body: JSON.stringify({ error: error.message }) };

    } else {
      return { statusCode: 400, body: JSON.stringify({ error: 'type must be invoice or estimate' }) };
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error('mark-paid unhandled error:', err);
    return { statusCode: 502, body: JSON.stringify({ error: err.message || 'Unexpected server error' }) };
  }
};

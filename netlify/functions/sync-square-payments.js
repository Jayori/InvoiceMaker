const { SquareClient, SquareEnvironment } = require('square');
const { createClient } = require('@supabase/supabase-js');

const square = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
});
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    // Fetch completed payments from Square (last 180 days)
    const beginTime = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    let cursor = undefined;
    const completedPayments = [];

    // Paginate through Square payments
    do {
      const result = await square.payments.list({
        beginTime,
        sortOrder: 'DESC',
        cursor,
        limit: 100,
      });
      const payments = result.payments || [];
      completedPayments.push(...payments.filter(p => p.status === 'COMPLETED'));
      cursor = result.cursor;
      // Stop after 500 payments to avoid long running function
      if (completedPayments.length >= 500) break;
    } while (cursor);

    if (!completedPayments.length) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoicesUpdated: 0, depositsUpdated: 0, message: 'No completed payments found in Square' }),
      };
    }

    // Build a map of orderId → paymentId for fast lookup
    const orderMap = {};
    for (const p of completedPayments) {
      if (p.orderId) orderMap[p.orderId] = p.id;
    }

    const orderIds = Object.keys(orderMap);

    // Update matching pending invoices
    let invoicesUpdated = 0;
    const { data: pendingInvoices } = await supabase
      .from('invoices')
      .select('id, square_order_id')
      .eq('status', 'pending')
      .in('square_order_id', orderIds);

    if (pendingInvoices?.length) {
      for (const inv of pendingInvoices) {
        const paymentId = orderMap[inv.square_order_id];
        const { error } = await supabase
          .from('invoices')
          .update({ status: 'paid', square_payment_id: paymentId, paid_at: new Date().toISOString() })
          .eq('id', inv.id);
        if (!error) invoicesUpdated++;
      }
    }

    // Update matching unpaid estimate deposits
    let depositsUpdated = 0;
    const { data: pendingDeposits } = await supabase
      .from('estimates')
      .select('id, deposit_order_id')
      .eq('deposit_paid', false)
      .not('deposit_order_id', 'is', null)
      .in('deposit_order_id', orderIds);

    if (pendingDeposits?.length) {
      for (const est of pendingDeposits) {
        const { error } = await supabase
          .from('estimates')
          .update({ deposit_paid: true })
          .eq('id', est.id);
        if (!error) depositsUpdated++;
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoicesUpdated, depositsUpdated }),
    };
  } catch (err) {
    console.error('Square sync error:', err);
    const detail = err.errors ? JSON.stringify(err.errors) : (err.message || String(err));
    return { statusCode: 502, body: JSON.stringify({ error: 'Square sync failed', detail }) };
  }
};

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { SquareClient, SquareEnvironment } = require('square');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const square = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { invoiceId, amount, passcode } = body;
  if (!invoiceId || !amount || !passcode) return { statusCode: 400, body: JSON.stringify({ error: 'invoiceId, amount, and passcode required' }) };

  const payAmount = parseFloat(amount);
  if (isNaN(payAmount) || payAmount < 0.01) return { statusCode: 400, body: JSON.stringify({ error: 'Amount must be at least $0.01' }) };

  const code = passcode.toUpperCase().trim();

  const { data: client } = await supabase.from('clients').select('email').eq('passcode', code).maybeSingle();
  const { data: invoice } = await supabase.from('invoices').select('*').eq('id', invoiceId).maybeSingle();
  if (!invoice) return { statusCode: 404, body: JSON.stringify({ error: 'Invoice not found' }) };

  const hasAccess = (client && invoice.client_email.toLowerCase() === client.email.toLowerCase()) ||
    invoice.passcode === code ||
    (invoice.co_clients || []).some(cc => cc.email?.toLowerCase() === client?.email?.toLowerCase());
  if (!hasAccess) return { statusCode: 403, body: JSON.stringify({ error: 'Access denied' }) };
  if (invoice.status === 'paid') return { statusCode: 400, body: JSON.stringify({ error: 'Invoice is already fully paid' }) };

  const alreadyPaid = parseFloat(invoice.amount_paid) || 0;
  const remaining = parseFloat(invoice.total) - alreadyPaid;
  if (payAmount > remaining + 0.01) return { statusCode: 400, body: JSON.stringify({ error: `Amount exceeds remaining balance of $${remaining.toFixed(2)}` }) };

  const finalAmount = Math.min(payAmount, remaining);

  try {
    const result = await square.checkout.paymentLinks.create({
      idempotencyKey: crypto.randomUUID(),
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        referenceId: invoice.invoice_number,
        lineItems: [{
          name: `Partial Payment \u2014 Invoice ${invoice.invoice_number}`,
          quantity: '1',
          basePriceMoney: { amount: BigInt(Math.round(finalAmount * 100)), currency: 'USD' },
        }],
      },
      checkoutOptions: { redirectUrl: `${process.env.APP_URL}/client.html?paid=${code}` },
    });

    const paymentLink = result.paymentLink.url;
    const squareOrderId = result.paymentLink.orderId;

    const existingIds = Array.isArray(invoice.partial_order_ids) ? invoice.partial_order_ids : [];
    await supabase.from('invoices').update({ partial_order_ids: [...existingIds, squareOrderId] }).eq('id', invoiceId);

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentLink, amount: finalAmount }) };
  } catch (err) {
    const detail = Array.isArray(err?.errors) ? err.errors.map(e => e.detail).join(', ') : err.message;
    return { statusCode: 502, body: JSON.stringify({ error: 'Square error', detail }) };
  }
};

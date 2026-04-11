const { SquareClient, SquareEnvironment } = require('square');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const square = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
});
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { invoiceId } = body;
  if (!invoiceId) return { statusCode: 400, body: JSON.stringify({ error: 'invoiceId required' }) };

  // Load invoice
  const { data: inv, error: loadErr } = await supabase
    .from('invoices').select('*').eq('id', invoiceId).single();
  if (loadErr || !inv) return { statusCode: 404, body: JSON.stringify({ error: 'Invoice not found' }) };

  const items = inv.items || [];
  const taxRate = inv.tax_rate || 0;
  const taxAmount = inv.tax_amount || 0;

  try {
    const lineItems = items.map(item => {
      const lineTotal = item.quantity * item.unitPrice;
      const disc = lineTotal > 0 ? Math.min(Number(item.discount) || 0, lineTotal) : 0;
      const netTotal = lineTotal - disc;
      if (netTotal <= 0) return null;
      if (disc > 0) {
        return { name: item.description.substring(0, 100), quantity: '1', basePriceMoney: { amount: BigInt(Math.round(netTotal * 100)), currency: 'USD' } };
      }
      return { name: item.description.substring(0, 100), quantity: String(item.quantity), basePriceMoney: { amount: BigInt(Math.round(item.unitPrice * 100)), currency: 'USD' } };
    }).filter(Boolean);

    if (taxRate > 0) {
      lineItems.push({ name: `Tax (${taxRate}%)`, quantity: '1', basePriceMoney: { amount: BigInt(Math.round(taxAmount * 100)), currency: 'USD' } });
    }

    if (!lineItems.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invoice has no billable items to create a payment link for' }) };
    }

    const paymentLinkResult = await square.checkout.paymentLinks.create({
      idempotencyKey: crypto.randomUUID(),
      order: { locationId: process.env.SQUARE_LOCATION_ID, referenceId: inv.invoice_number, lineItems },
      checkoutOptions: { redirectUrl: `${process.env.APP_URL}/client.html?paid=${inv.passcode}` },
    });

    const newLink = paymentLinkResult.paymentLink.url;
    const newOrderId = paymentLinkResult.paymentLink.orderId;

    const { error: updateErr } = await supabase
      .from('invoices')
      .update({ status: 'pending', square_payment_link: newLink, square_order_id: newOrderId, paid_at: null, square_payment_id: null })
      .eq('id', invoiceId);

    if (updateErr) return { statusCode: 502, body: JSON.stringify({ error: updateErr.message }) };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, square_payment_link: newLink }),
    };
  } catch (err) {
    console.error('Square error:', err);
    const detail = err.errors ? JSON.stringify(err.errors) : (err.message || String(err));
    return { statusCode: 502, body: JSON.stringify({ error: 'Square error', detail }) };
  }
};

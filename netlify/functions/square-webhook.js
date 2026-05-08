const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function verifySquareSignature(body, signature, signingKey, notificationUrl) {
  // Square signs with HMAC-SHA256 of (notification URL + raw body)
  const combined = notificationUrl + body;
  const hash = crypto
    .createHmac('sha256', signingKey)
    .update(combined)
    .digest('base64');
  return hash === signature;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const signature = event.headers['x-square-hmacsha256-signature'];
  const signingKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const host = event.headers['host'];

  // Log every incoming webhook so we can inspect it in Netlify function logs
  console.log('=== SQUARE WEBHOOK RECEIVED ===');
  console.log('Host:', host);
  console.log('Signature header present:', !!signature);
  console.log('Raw body (first 500):', (event.body || '').substring(0, 500));

  // Try both URL formats — Netlify redirects /api/* to /.netlify/functions/*
  // Square needs the URL to match exactly what was registered in Square Dashboard
  const urlDirect = `https://${host}/.netlify/functions/square-webhook`;
  const urlApi    = `https://${host}/api/square-webhook`;

  const sigValidDirect = verifySquareSignature(event.body, signature, signingKey, urlDirect);
  const sigValidApi    = verifySquareSignature(event.body, signature, signingKey, urlApi);

  console.log('Sig valid (direct URL):', sigValidDirect, '->', urlDirect);
  console.log('Sig valid (api URL):', sigValidApi, '->', urlApi);

  if (!sigValidDirect && !sigValidApi) {
    console.error('Square webhook signature verification FAILED for both URL formats');
    return { statusCode: 401, body: 'Unauthorized' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  console.log('Event type:', payload.type);
  const payment = payload.data?.object?.payment;
  console.log('Payment status:', payment?.status);
  console.log('Payment order_id:', payment?.order_id);
  console.log('Payment id:', payment?.id);

  const isCompleted =
    (payload.type === 'payment.updated' || payload.type === 'payment.completed') &&
    payment?.status === 'COMPLETED';

  console.log('isCompleted:', isCompleted);

  if (isCompleted) {
    const orderId = payment.order_id;
    const paymentId = payment.id;
    const paidCents = payment.amount_money?.amount;
    const paidAmount = paidCents != null ? paidCents / 100 : null;

    if (orderId) {
      // Try matching on original square_order_id first
      let invoice = null;
      const { data: byOriginal } = await supabase
        .from('invoices')
        .select('id, invoice_number, total, amount_paid, status')
        .eq('square_order_id', orderId)
        .in('status', ['pending', 'partial'])
        .maybeSingle();

      if (byOriginal) {
        invoice = byOriginal;
      } else {
        // Try matching on partial payment order IDs
        const { data: byPartial } = await supabase
          .from('invoices')
          .select('id, invoice_number, total, amount_paid, status')
          .contains('partial_order_ids', [orderId])
          .in('status', ['pending', 'partial'])
          .maybeSingle();
        if (byPartial) invoice = byPartial;
      }

      if (invoice) {
        const currentPaid = parseFloat(invoice.amount_paid) || 0;
        const total = parseFloat(invoice.total);
        const newPaid = paidAmount !== null
          ? Math.min(+(currentPaid + paidAmount).toFixed(2), total)
          : total;
        const newStatus = newPaid >= total - 0.01 ? 'paid' : 'partial';
        const update = { amount_paid: newPaid, status: newStatus, square_payment_id: paymentId };
        if (newStatus === 'paid') update.paid_at = new Date().toISOString();

        const { error } = await supabase.from('invoices').update(update).eq('id', invoice.id);
        console.log('Invoice updated:', invoice.invoice_number, '| status:', newStatus, '| amount_paid:', newPaid);
        if (error) console.error('Supabase invoice update error:', error);
      } else {
        console.log('No matching invoice for order_id:', orderId);
      }

      const { data: depMatched } = await supabase
        .from('estimates')
        .update({ deposit_paid: true })
        .eq('deposit_order_id', orderId)
        .eq('deposit_paid', false)
        .select('id');

      console.log('Deposit update matched:', depMatched?.length ?? 0, 'rows');
    }
  }

  return { statusCode: 200, body: 'OK' };
};

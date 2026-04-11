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

  // Build the full notification URL (must match exactly what's registered in Square Dashboard)
  const host = event.headers['host'];
  const notificationUrl = `https://${host}/.netlify/functions/square-webhook`;

  if (!verifySquareSignature(event.body, signature, signingKey, notificationUrl)) {
    console.error('Square webhook signature verification failed');
    return { statusCode: 401, body: 'Unauthorized' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Handle payment completed events.
  // Square sends 'payment.updated' (status='COMPLETED') not 'payment.completed'.
  const payment = payload.data?.object?.payment;
  const isCompleted =
    (payload.type === 'payment.updated' || payload.type === 'payment.completed') &&
    payment?.status === 'COMPLETED';

  if (isCompleted) {
    if (!payment) {
      return { statusCode: 200, body: 'OK' };
    }

    const orderId = payment.order_id;
    const paymentId = payment.id;

    if (orderId) {
      // Update invoice if this order matches one
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'paid', square_payment_id: paymentId, paid_at: new Date().toISOString() })
        .eq('square_order_id', orderId)
        .eq('status', 'pending');

      if (error) {
        console.error('Supabase invoice update error:', error);
      }

      // Update estimate deposit if this order matches a deposit
      await supabase
        .from('estimates')
        .update({ deposit_paid: true })
        .eq('deposit_order_id', orderId)
        .eq('deposit_paid', false);
    }
  }

  return { statusCode: 200, body: 'OK' };
};

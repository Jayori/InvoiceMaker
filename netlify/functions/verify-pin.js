exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const { pin } = JSON.parse(event.body || '{}');
  if (pin && pin === process.env.MANAGER_PIN) {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }
  return { statusCode: 401, body: JSON.stringify({ ok: false }) };
};

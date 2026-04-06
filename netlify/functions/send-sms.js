// Shared TextBelt SMS helper
// Usage: await sendSms(phone, message)
// Returns: { success: true } or { success: false, error: '...' }

async function sendSms(phone, message) {
  const key = process.env.TEXTBELT_API_KEY;
  if (!key || !phone) return { success: false, error: 'No API key or phone' };

  // Strip non-digits, add +1 for 10-digit US numbers
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+') && cleaned.replace(/\D/g, '').length === 10) cleaned = '+1' + cleaned;
  if (cleaned.replace(/\D/g, '').length < 10) return { success: false, error: 'Invalid phone number' };

  try {
    console.log('SMS attempt — phone:', cleaned, 'key prefix:', key.substring(0, 8) + '...');
    const res = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleaned, message, key }),
    });
    const data = await res.json();
    console.log('TextBelt response:', JSON.stringify(data));
    if (!data.success) return { success: false, error: data.error || 'TextBelt error' };
    return { success: true };
  } catch (err) {
    console.error('SMS fetch error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendSms };

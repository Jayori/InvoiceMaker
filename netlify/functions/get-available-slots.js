const { getCalendarClient } = require('./gcal-client');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

  const { date } = event.queryStringParameters || {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'date required (YYYY-MM-DD)' }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data: profile } = await supabase
    .from('business_profile')
    .select('work_hours_start, work_hours_end, work_hours_per_day, blocked_days, gcal_refresh_token')
    .eq('id', 1).single();

  if (!profile?.gcal_refresh_token) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slots: [], connected: false }),
    };
  }

  // Determine day of week (0=Sun, 1=Mon … 6=Sat)
  const dayOfWeek = new Date(date + 'T12:00:00').getDay();
  const perDay = profile.work_hours_per_day;

  // Check if day is blocked
  let workStart, workEnd;
  if (perDay) {
    const dayConfig = perDay[String(dayOfWeek)];
    if (dayConfig === null || dayConfig === undefined) {
      // Day is blocked — no slots
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: [], connected: true, blocked: true }),
      };
    }
    workStart = dayConfig.start ?? (profile.work_hours_start ?? 8);
    workEnd = dayConfig.end ?? (profile.work_hours_end ?? 17);
  } else {
    // Fall back to legacy blocked_days array
    const blockedDays = profile.blocked_days || [0, 6];
    if (Array.isArray(blockedDays) && blockedDays.includes(dayOfWeek)) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: [], connected: true, blocked: true }),
      };
    }
    workStart = profile.work_hours_start ?? 8;
    workEnd = profile.work_hours_end ?? 17;
  }

  // Build time range covering the full work day
  const dayStart = new Date(`${date}T${String(workStart).padStart(2, '0')}:00:00`);
  const dayEnd = new Date(`${date}T${String(workEnd).padStart(2, '0')}:00:00`);
  const now = new Date();

  try {
    const { calendar, calendarId } = await getCalendarClient();

    const freebusyRes = await calendar.freebusy.query({
      requestBody: {
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        items: [{ id: calendarId }],
      },
    });

    const busy = freebusyRes.data.calendars?.[calendarId]?.busy || [];

    const slots = [];
    for (let h = workStart; h < workEnd; h++) {
      const slotStart = new Date(`${date}T${String(h).padStart(2, '0')}:00:00`);
      const slotEnd = new Date(`${date}T${String(h + 1).padStart(2, '0')}:00:00`);

      if (slotStart <= now) continue;

      const isBusy = busy.some(b => {
        const bs = new Date(b.start);
        const be = new Date(b.end);
        return slotStart < be && slotEnd > bs;
      });

      if (!isBusy) {
        slots.push({
          iso: slotStart.toISOString(),
          label: slotStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
        });
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slots, connected: true }),
    };
  } catch (err) {
    console.error('get-available-slots error:', err);
    return { statusCode: 502, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err.message }) };
  }
};

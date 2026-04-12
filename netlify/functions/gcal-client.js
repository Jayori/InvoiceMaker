const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

async function getCalendarClient() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data: profile } = await supabase
    .from('business_profile').select('gcal_refresh_token, gcal_calendar_id').eq('id', 1).single();

  if (!profile?.gcal_refresh_token) {
    throw new Error('Google Calendar not connected. Please connect in Settings.');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: profile.gcal_refresh_token });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const calendarId = profile.gcal_calendar_id || 'primary';
  return { calendar, calendarId };
}

async function createCalendarEvent({ title, description, scheduledAt, durationMins = 60 }) {
  const { calendar, calendarId } = await getCalendarClient();
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + durationMins * 60 * 1000);
  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: title,
      description: description || '',
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      colorId: '2',
    },
  });
  return res.data.id;
}

async function updateCalendarEvent(eventId, { title, description, scheduledAt, durationMins = 60 }) {
  const { calendar, calendarId } = await getCalendarClient();
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + durationMins * 60 * 1000);
  const res = await calendar.events.update({
    calendarId,
    eventId,
    requestBody: {
      summary: title,
      description: description || '',
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      colorId: '2',
    },
  });
  return res.data.id;
}

async function deleteCalendarEvent(eventId) {
  try {
    const { calendar, calendarId } = await getCalendarClient();
    await calendar.events.delete({ calendarId, eventId });
  } catch (err) {
    console.error('gcal delete error (non-fatal):', err.message);
  }
}

module.exports = { getCalendarClient, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent };

import { google } from 'googleapis';
import credentials from '@/app/data/credentials.json';

function getOAuth2Client() {
  const { client_id, client_secret, redirect_uris } = credentials.installed;
  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return client;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location: string;
  description: string;
  allDay: boolean;
}

function resolveEventDateRange(
  startDate?: string,
  endDate?: string,
  daysAhead?: number
): { timeMin: string; timeMax: string } | { error: string } {
  let start: Date;
  if (startDate) {
    start = new Date(startDate);
    if (isNaN(start.getTime())) {
      return { error: `"${startDate}" isn't a valid date.` };
    }
  } else {
    start = new Date();
    start.setHours(0, 0, 0, 0);
  }

  let end: Date;
  if (endDate) {
    end = new Date(endDate);
    if (isNaN(end.getTime())) {
      return { error: `"${endDate}" isn't a valid date.` };
    }
    end.setDate(end.getDate() + 1); // make the end date inclusive
  } else if (daysAhead !== undefined && !startDate) {
    end = new Date(start);
    end.setDate(end.getDate() + Math.max(0, Number(daysAhead)) + 1);
  } else {
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  }

  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

export async function list_events(
  startDate?: string,
  endDate?: string,
  daysAhead?: number,
  count: number = 20
): Promise<CalendarEvent[] | string> {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return "Calendar isn't connected — no Google refresh token configured.";
  }

  const range = resolveEventDateRange(startDate, endDate, daysAhead);
  if ('error' in range) {
    return range.error;
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: getOAuth2Client() });
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: range.timeMin,
      timeMax: range.timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: count,
    });

    const items = res.data.items ?? [];
    return items.map((item) => ({
      id: item.id ?? '',
      summary: item.summary ?? '(no title)',
      start: item.start?.dateTime ?? item.start?.date ?? '',
      end: item.end?.dateTime ?? item.end?.date ?? '',
      location: item.location ?? '',
      description: item.description ?? '',
      allDay: !item.start?.dateTime,
    }));
  } catch (err) {
    console.error('list_events failed:', err);
    return "Couldn't reach the calendar just now.";
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatLocalDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export async function create_event(
  summary: string,
  date: string,
  startTime: string,
  durationMinutes?: number,
  endTime?: string,
  description?: string,
  location?: string
): Promise<string> {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return "Calendar isn't connected — no Google refresh token configured.";
  }

  const startDateTime = `${date}T${startTime}:00`;
  const start = new Date(startDateTime);
  if (isNaN(start.getTime())) {
    return `"${date} ${startTime}" isn't a valid date/time.`;
  }

  let endDateTime: string;
  if (endTime) {
    endDateTime = `${date}T${endTime}:00`;
  } else {
    const end = new Date(start.getTime() + (durationMinutes ?? 60) * 60000);
    endDateTime = formatLocalDateTime(end);
  }
  const end = new Date(endDateTime);
  if (isNaN(end.getTime())) {
    return `"${date} ${endTime}" isn't a valid date/time.`;
  }
  if (end.getTime() <= start.getTime()) {
    return 'That end time is before the start time.';
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  try {
    const calendar = google.calendar({ version: 'v3', auth: getOAuth2Client() });
    await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        description,
        location,
        start: { dateTime: startDateTime, timeZone },
        end: { dateTime: endDateTime, timeZone },
      },
    });

    const formattedDate = start.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const formattedTime = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `Created "${summary}" on ${formattedDate} at ${formattedTime}.`;
  } catch (err) {
    console.error('create_event failed:', err);
    return "Couldn't reach the calendar just now.";
  }
}

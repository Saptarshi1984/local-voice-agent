import { google } from 'googleapis';

function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
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

function resolveDateKeyword(value: string): string {
  if (!value) return value;
  const trimmed = value.trim().toLowerCase();
  const offset = trimmed === 'today' ? 0 : trimmed === 'tomorrow' ? 1 : trimmed === 'yesterday' ? -1 : null;
  if (offset === null) return value;

  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function resolveEventDateRange(
  startDate?: string,
  endDate?: string,
  daysAhead?: number
): { timeMin: string; timeMax: string } | { error: string } {
  let start: Date;
  if (startDate) {
    start = new Date(resolveDateKeyword(startDate));
    if (isNaN(start.getTime())) {
      return { error: `"${startDate}" isn't a valid date.` };
    }
  } else {
    start = new Date();
    start.setHours(0, 0, 0, 0);
  }

  let end: Date;
  if (endDate) {
    end = new Date(resolveDateKeyword(endDate));
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

  date = resolveDateKeyword(date);
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

function formatTimeOnly(start?: { dateTime?: string | null; date?: string | null }): string {
  if (!start?.dateTime) return 'all-day';
  const d = new Date(start.dateTime);
  return isNaN(d.getTime()) ? 'all-day' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatEventWhen(start?: { dateTime?: string | null; date?: string | null }): string {
  if (start?.dateTime) {
    const d = new Date(start.dateTime);
    if (!isNaN(d.getTime())) {
      const formattedDate = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      const formattedTime = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      return ` on ${formattedDate} at ${formattedTime}`;
    }
  }
  if (start?.date) {
    const d = new Date(start.date);
    if (!isNaN(d.getTime())) {
      return ` on ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
    }
  }
  return '';
}

function normalizeTime(input?: string): string | undefined {
  if (!input) return input;
  const trimmed = input.trim();
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [h, m] = trimmed.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i);
  if (match) {
    let hour = parseInt(match[1], 10);
    const minute = match[2] ?? '00';
    const meridiem = match[3].toLowerCase();
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${minute}`;
  }
  return trimmed;
}

async function findEventBySummaryAndDate(
  calendar: ReturnType<typeof google.calendar>,
  summary: string,
  date: string,
  time?: string
): Promise<{ event: { id: string; summary: string; start: any; end: any } } | { error: string }> {
  date = resolveDateKeyword(date);
  const day = new Date(date);
  if (isNaN(day.getTime())) {
    return { error: `"${date}" isn't a valid date.` };
  }
  const timeMin = new Date(day);
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date(timeMin);
  timeMax.setDate(timeMax.getDate() + 1);

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    q: summary,
  });

  const items = res.data.items ?? [];
  let matches = items.filter((item) =>
    (item.summary ?? '').toLowerCase().includes(summary.toLowerCase())
  );

  if (matches.length === 0) {
    return { error: `No event matching "${summary}" found on ${date}.` };
  }

  const normalizedTime = normalizeTime(time);
  if (matches.length > 1 && normalizedTime) {
    const narrowed = matches.filter((item) => item.start?.dateTime?.slice(11, 16) === normalizedTime);
    if (narrowed.length > 0) matches = narrowed;
  }

  if (matches.length > 1) {
    const list = matches
      .map((item) => `${item.summary ?? '(no title)'} (${formatTimeOnly(item.start)})`)
      .join(' vs ');
    return {
      error: `AMBIGUOUS — nothing was found or changed yet. Multiple events match "${summary}" on ${date}: ${list}. Ask the user which one, do not report any of them as done.`,
    };
  }

  const match = matches[0];
  return {
    event: {
      id: match.id ?? '',
      summary: match.summary ?? '(no title)',
      start: match.start,
      end: match.end,
    },
  };
}

export async function delete_event(summary: string, date: string, time?: string): Promise<string> {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return "Calendar isn't connected — no Google refresh token configured.";
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: getOAuth2Client() });
    const found = await findEventBySummaryAndDate(calendar, summary, date, time);
    if ('error' in found) {
      return found.error;
    }

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: found.event.id,
    });

    return `Deleted "${found.event.summary}"${formatEventWhen(found.event.start)}.`;
  } catch (err) {
    console.error('delete_event failed:', err);
    return "Couldn't reach the calendar just now.";
  }
}

export async function delete_events_on_date(date: string, confirm: boolean = false): Promise<string> {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return "Calendar isn't connected — no Google refresh token configured.";
  }

  date = resolveDateKeyword(date);
  const day = new Date(date);
  if (isNaN(day.getTime())) {
    return `"${date}" isn't a valid date.`;
  }
  const timeMin = new Date(day);
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date(timeMin);
  timeMax.setDate(timeMax.getDate() + 1);

  try {
    const calendar = google.calendar({ version: 'v3', auth: getOAuth2Client() });
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const items = res.data.items ?? [];
    if (items.length === 0) {
      return `No events found on ${date} to delete.`;
    }

    const list = items.map((item) => `${item.summary ?? '(no title)'} (${formatTimeOnly(item.start)})`).join(', ');

    if (!confirm) {
      return `NOT DELETED YET — found ${items.length} event(s) on ${date}: ${list}. Read this list back to the user and ask them to explicitly confirm before calling this again with confirm set to true. Do not confirm on their behalf.`;
    }

    for (const item of items) {
      if (item.id) {
        await calendar.events.delete({ calendarId: 'primary', eventId: item.id });
      }
    }

    return `Deleted ${items.length} event(s) on ${date}: ${list}.`;
  } catch (err) {
    console.error('delete_events_on_date failed:', err);
    return "Couldn't reach the calendar just now.";
  }
}

export async function modify_event(
  summary: string,
  date: string,
  newSummary?: string,
  newDate?: string,
  newStartTime?: string,
  newEndTime?: string,
  durationMinutes?: number,
  description?: string,
  location?: string,
  currentTime?: string
): Promise<string> {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return "Calendar isn't connected — no Google refresh token configured.";
  }

  date = resolveDateKeyword(date);
  if (newDate) newDate = resolveDateKeyword(newDate);

  try {
    const calendar = google.calendar({ version: 'v3', auth: getOAuth2Client() });
    const found = await findEventBySummaryAndDate(calendar, summary, date, currentTime);
    if ('error' in found) {
      return found.error;
    }

    const requestBody: Record<string, unknown> = {};
    if (newSummary) requestBody.summary = newSummary;
    if (description !== undefined) requestBody.description = description;
    if (location !== undefined) requestBody.location = location;

    if (newDate || newStartTime || newEndTime || durationMinutes !== undefined) {
      const effectiveDate = newDate ?? date;
      const existingStart: string | undefined = found.event.start?.dateTime ?? found.event.start?.date;
      const existingStartTime = newStartTime ?? (existingStart ? existingStart.slice(11, 16) : undefined);
      if (!existingStartTime) {
        return "Couldn't determine a start time to update from.";
      }

      const startDateTime = `${effectiveDate}T${existingStartTime}:00`;
      const start = new Date(startDateTime);
      if (isNaN(start.getTime())) {
        return `"${effectiveDate} ${existingStartTime}" isn't a valid date/time.`;
      }

      let endDateTime: string;
      if (newEndTime) {
        endDateTime = `${effectiveDate}T${newEndTime}:00`;
      } else if (durationMinutes !== undefined) {
        endDateTime = formatLocalDateTime(new Date(start.getTime() + durationMinutes * 60000));
      } else {
        const existingEnd: string | undefined = found.event.end?.dateTime ?? found.event.end?.date;
        const existingDurationMs =
          existingEnd && existingStart
            ? new Date(existingEnd).getTime() - new Date(existingStart).getTime()
            : 60 * 60000;
        endDateTime = formatLocalDateTime(new Date(start.getTime() + existingDurationMs));
      }
      const end = new Date(endDateTime);
      if (isNaN(end.getTime())) {
        return `"${effectiveDate} ${newEndTime}" isn't a valid date/time.`;
      }
      if (end.getTime() <= start.getTime()) {
        return 'That end time is before the start time.';
      }

      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      requestBody.start = { dateTime: startDateTime, timeZone };
      requestBody.end = { dateTime: endDateTime, timeZone };
    }

    if (Object.keys(requestBody).length === 0) {
      return 'Nothing to update.';
    }

    await calendar.events.patch({
      calendarId: 'primary',
      eventId: found.event.id,
      requestBody,
    });

    const confirmStart = requestBody.start
      ? (requestBody.start as { dateTime: string })
      : found.event.start;
    return `Updated "${newSummary ?? found.event.summary}"${formatEventWhen(confirmStart)}.`;
  } catch (err) {
    console.error('modify_event failed:', err);
    return "Couldn't reach the calendar just now.";
  }
}

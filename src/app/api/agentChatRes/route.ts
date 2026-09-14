import ollama from 'ollama';
import { get_unread_email_count, get_unread_emails_details, type EmailDetail } from '@/lib/gmail';
import { list_events, create_event, type CalendarEvent } from '@/lib/calendar';

function get_weather(city: string): string {
  // Mock implementation of the get_weather function
  // In a real-world scenario, you would fetch weather data from an API
  return `The current weather in ${city} is sunny with a temperature of 25°C.`;
}

function get_date(offsetDays: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + Number(offsetDays));
  return `${date.toDateString()} ${date.toLocaleTimeString()}`;
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather for a city',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' },
        },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_date',
      description:
        'Get the date and time for today or a day relative to today, e.g. yesterday, tomorrow, day before yesterday, day after tomorrow',
      parameters: {
        type: 'object',
        properties: {
          offset_days: {
            type: 'number',
            description:
              'Number of days relative to today: 0 for today, -1 for yesterday, -2 for day before yesterday, 1 for tomorrow, 2 for day after tomorrow, and so on',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_unread_email_count',
      description:
        'Get the number of unread emails in the inbox for a date range, defaulting to today. For any relative phrasing (yesterday, last 7 days, this week, etc.) use days_ago directly instead of computing a date yourself. Use start_date/end_date only when you already have a concrete calendar date.',
      parameters: {
        type: 'object',
        properties: {
          days_ago: {
            type: 'number',
            description:
              'How many days back from today to include, as a single non-negative whole number (never negative). The range always runs through today, inclusive. 0 = today only, 1 = yesterday and today, 7 = the last 7 days including today.',
          },
          start_date: { type: 'string', description: 'A specific calendar date, e.g. "2026-09-13". Only use this if you know the exact date; otherwise use days_ago.' },
          end_date: { type: 'string', description: 'End of the date range (inclusive), e.g. "2026-09-13". Defaults to start_date.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_unread_emails_details',
      description:
        "Show the user's unread emails (sender, subject, date) directly in the UI, for a date range defaulting to today. For any relative phrasing (yesterday, last 7 days, this week, etc.) use days_ago directly instead of computing a date yourself. Use start_date/end_date only when you already have a concrete calendar date. Use when asked to show/list/display unread email details. Don't recite the contents back — just confirm they're shown.",
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Max number of emails to show (default 15)' },
          days_ago: {
            type: 'number',
            description:
              'How many days back from today to include, as a single non-negative whole number (never negative). The range always runs through today, inclusive. 0 = today only, 1 = yesterday and today, 7 = the last 7 days including today.',
          },
          start_date: { type: 'string', description: 'A specific calendar date, e.g. "2026-09-13". Only use this if you know the exact date; otherwise use days_ago.' },
          end_date: { type: 'string', description: 'End of the date range (inclusive), e.g. "2026-09-13". Defaults to start_date.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_events',
      description:
        "Show the user's calendar events (title, time, location) directly in the UI, for a date range defaulting to today only. For relative phrasing (today, this week, next 7 days, etc.) use days_ahead directly instead of computing dates yourself — 0 or omitted means today only, 7 means today through the next 7 days. Use start_date/end_date only when you already have concrete calendar dates. Use when asked what's on the calendar, what events/meetings are scheduled, or to list/show/display events. Don't recite the contents back — just confirm they're shown.",
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Max number of events to show (default 20)' },
          days_ahead: {
            type: 'number',
            description:
              'How many days forward from today to include. 0 or omitted = today only, 7 = today through the next 7 days ("this week").',
          },
          start_date: { type: 'string', description: 'A specific calendar date, e.g. "2026-09-15". Only use this if you know the exact date; otherwise use days_ahead.' },
          end_date: { type: 'string', description: 'End of the date range (inclusive). Defaults to start_date.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_event',
      description:
        "Create a new event on the user's calendar. Only call this once you have a clear event title, a specific date, and a specific start time — if the user hasn't given a time, date, or a clear event name, ask them one short clarifying question first instead of guessing or picking a default. Duration defaults to 1 hour if not given. After creating, briefly confirm what was created and when — don't restate the full request.",
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Short event title, e.g. "Meeting with Bob"' },
          date: { type: 'string', description: 'Event date, e.g. "2026-09-15". Must be specific — never guess.' },
          start_time: { type: 'string', description: 'Start time, 24-hour HH:MM, e.g. "15:00" for 3pm. Must be specific — never guess.' },
          duration_minutes: { type: 'number', description: 'Event length in minutes. Defaults to 60 if end_time not set.' },
          end_time: { type: 'string', description: '24-hour HH:MM. Optional — overrides duration_minutes.' },
          description: { type: 'string', description: 'Optional notes/details.' },
          location: { type: 'string', description: 'Optional event location.' },
        },
        required: ['summary', 'date', 'start_time'],
      },
    },
  },
];

const toolImpls: Record<string, (args: any) => string | Promise<string>> = {
  get_weather: (args) => get_weather(args.city),
  get_date: (args) => get_date(args?.offset_days ?? 0),
  get_unread_email_count: (args) =>
    get_unread_email_count(
      args?.start_date,
      args?.end_date,
      args?.days_ago !== undefined ? Number(args.days_ago) : undefined
    ),
  create_event: (args) =>
    create_event(
      args.summary,
      args.date,
      args.start_time,
      args.duration_minutes !== undefined ? Number(args.duration_minutes) : undefined,
      args.end_time,
      args.description,
      args.location
    ),
};

const MAX_TOOL_TURNS = 4;

export async function POST(req: Request) {
  const { messages } = await req.json();

  let currentMessages = [...messages];
  let emailDetails: EmailDetail[] | null = null;
  let calendarEvents: CalendarEvent[] | null = null;
  let response = await ollama.chat({
    model: 'sid:latest',
    messages: currentMessages,
    tools: tools,
  });

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const toolCalls = response.message.tool_calls;

    console.log('Tool calls:', toolCalls);

    if (!toolCalls || toolCalls.length === 0) break;

    currentMessages = [...currentMessages, response.message];

    for (const call of toolCalls) {
      if (call.function.name === 'get_unread_emails_details') {
        const result = await get_unread_emails_details(
          Number(call.function.arguments?.count ?? 15),
          call.function.arguments?.start_date,
          call.function.arguments?.end_date,
          call.function.arguments?.days_ago !== undefined
            ? Number(call.function.arguments.days_ago)
            : undefined
        );
        const toolMessage =
          typeof result === 'string'
            ? result
            : result.length === 0
              ? 'No unread emails.'
              : `${result.length} unread email(s) are already visible on the user's screen right now — you were not given their contents and have no way to know them. Reply with only a short acknowledgement (e.g. "They're up on your screen."). Do not name any sender, subject, or count beyond what you already know.`;

        if (Array.isArray(result)) emailDetails = result;

        currentMessages.push({
          role: 'tool',
          tool_name: call.function.name,
          content: toolMessage,
        });
        continue;
      }

      if (call.function.name === 'list_events') {
        const result = await list_events(
          call.function.arguments?.start_date,
          call.function.arguments?.end_date,
          call.function.arguments?.days_ahead !== undefined
            ? Number(call.function.arguments.days_ahead)
            : undefined,
          call.function.arguments?.count !== undefined
            ? Number(call.function.arguments.count)
            : undefined
        );
        const toolMessage =
          typeof result === 'string'
            ? result
            : result.length === 0
              ? 'No events in that range.'
              : `${result.length} event(s) are already visible on the user's screen right now — you were not given their details and have no way to know them. Reply with only a short acknowledgement (e.g. "They're up on your screen."). Do not name any event title, time, or count beyond what you already know.`;

        if (Array.isArray(result)) calendarEvents = result;

        currentMessages.push({
          role: 'tool',
          tool_name: call.function.name,
          content: toolMessage,
        });
        continue;
      }

      const impl = toolImpls[call.function.name];
      const result = impl
        ? await impl(call.function.arguments)
        : `Error: unknown tool "${call.function.name}"`;

      currentMessages.push({
        role: 'tool',
        tool_name: call.function.name,
        content: result,
      });
    }

    response = await ollama.chat({
      model: 'sid:latest',
      messages: currentMessages,
      tools: tools,
    });
  }

  return new Response(JSON.stringify({ ...response, emailDetails, calendarEvents }), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

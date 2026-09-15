import ollama from 'ollama';
import { get_unread_email_count, get_unread_emails_details, type EmailDetail } from '@/lib/gmail';
import { list_events, create_event, delete_event, delete_events_on_date, modify_event, type CalendarEvent } from '@/lib/calendar';

function get_weather(city: string): string {
  // Mock implementation of the get_weather function
  // In a real-world scenario, you would fetch weather data from an API
  return `The current weather in ${city} is sunny with a temperature of 25°C.`;
}

function get_date(offsetDays: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + Number(offsetDays));
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `${iso} (${date.toDateString()}), current time ${date.toLocaleTimeString()}`;
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
        "Create a BRAND-NEW event on the user's calendar — one that doesn't already exist. If the user wants to move, reschedule, or change an event that's already on the calendar, use modify_event instead; calling create_event for that would leave the old event in place and create a duplicate. Only call this once you have a clear event title, a specific date, and a specific start time — if the user hasn't given a time, date, or a clear event name, ask them one short clarifying question first instead of guessing or picking a default. Duration defaults to 1 hour if not given. After creating, briefly confirm what was created and when — don't restate the full request.",
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Short event title, e.g. "Meeting with Bob"' },
          date: { type: 'string', description: 'Event date, e.g. "2026-09-15", or literally "today"/"tomorrow"/"yesterday". Must be specific or one of those words — never guess a different date.' },
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
  {
    type: 'function',
    function: {
      name: 'delete_event',
      description:
        "Delete an event from the user's calendar. Identify the event by its title and the date it's on. If the tool reports more than one matching event, it lists each one's title and time — read that list back to the user and ask which one they meant, then call this again with the time field set to pick the right one. Confirm briefly once deleted.",
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Title (or a distinctive part of it) of the event to delete, e.g. "Meeting with Bob"' },
          date: { type: 'string', description: "The date the event is on, e.g. \"2026-09-15\", or literally \"today\"/\"tomorrow\"/\"yesterday\". Must be specific or one of those words — never guess a different date." },
          time: { type: 'string', description: 'Optional 24-hour HH:MM start time, only needed to pick between multiple same-titled events on the same day.' },
        },
        required: ['summary', 'date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_events_on_date',
      description:
        "Delete EVERY event on a given date — a bulk, irreversible action. This is a two-step tool: call it first with confirm left false (or omitted) to get back the list of events on that date without deleting anything, read that list back to the user, and wait for them to explicitly say yes. Only then call it again with confirm set to true to actually delete them all. Never set confirm to true on the first call, and never assume the user meant to delete everything unless they explicitly asked to clear/delete all events on that specific date.",
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'The date to clear, e.g. "2026-09-15", or literally "today"/"tomorrow"/"yesterday". Must be specific or one of those words — never guess a different date.' },
          confirm: { type: 'boolean', description: 'Set to true only after the user has explicitly confirmed, having heard the list of events that will be deleted. Defaults to false.' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'modify_event',
      description:
        "Change an EXISTING event on the user's calendar — this is the tool for \"move\", \"reschedule\", \"change the time/date of\", \"rename\", or \"update\" an event that's already on the calendar. Identify the event by its current title and the date it's currently on. Only pass the fields that are actually changing (new_summary, new_date, new_start_time, new_end_time, duration_minutes, description, location). If the tool reports more than one matching event, it lists each one's title and time — read that list back to the user and ask which one they meant, then call this again with current_time set to pick the right one. Never use create_event for this — create_event makes a brand-new, separate event and would leave the original in place, producing a duplicate instead of moving it. If the event to modify or the change requested is unclear, ask a short clarifying question first. Confirm briefly once updated.",
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Current title (or a distinctive part of it) of the event to modify, e.g. "Meeting with Bob"' },
          current_date: { type: 'string', description: "The date the event is CURRENTLY on, right now, before any change — e.g. \"2026-09-15\", or literally \"today\"/\"tomorrow\"/\"yesterday\". This is where to find the event, not where it's moving to. Must be specific or one of those words — never guess a different date." },
          current_time: { type: 'string', description: 'Optional 24-hour HH:MM start time the event is CURRENTLY at, only needed to pick between multiple same-titled events on the same day.' },
          new_summary: { type: 'string', description: 'New title for the event, if changing.' },
          new_date: { type: 'string', description: 'The date to move the event TO, e.g. "2026-09-16", or literally "today"/"tomorrow"/"yesterday" — only set this if the event is moving to a different day than current_date.' },
          new_start_time: { type: 'string', description: 'New start time, 24-hour HH:MM, if changing.' },
          new_end_time: { type: 'string', description: '24-hour HH:MM. Optional — overrides duration_minutes.' },
          duration_minutes: { type: 'number', description: 'New event length in minutes, if changing and new_end_time not given.' },
          description: { type: 'string', description: 'New notes/details, if changing.' },
          location: { type: 'string', description: 'New location, if changing.' },
        },
        required: ['summary', 'current_date'],
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
  delete_event: (args) => delete_event(args.summary, args.date, args.time),
  delete_events_on_date: (args) => delete_events_on_date(args.date, args.confirm === true),
  modify_event: (args) =>
    modify_event(
      args.summary,
      args.current_date,
      args.new_summary,
      args.new_date,
      args.new_start_time,
      args.new_end_time,
      args.duration_minutes !== undefined ? Number(args.duration_minutes) : undefined,
      args.description,
      args.location,
      args.current_time
    ),
};

const MAX_TOOL_TURNS = 4;

function looksLikeGarbledToolCall(content: string | undefined): boolean {
  if (!content) return false;
  const trimmed = content.trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}') && /"name"\s*:/.test(trimmed);
}

async function chatWithRetry(
  params: Parameters<typeof ollama.chat>[0],
  retries = 1,
  delayMs = 3000
): ReturnType<typeof ollama.chat> {
  try {
    return await ollama.chat(params);
  } catch (err) {
    if (retries <= 0) throw err;
    console.error('ollama.chat failed, retrying:', err);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return chatWithRetry(params, retries - 1, delayMs);
  }
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  let currentMessages = [...messages];
  let emailDetails: EmailDetail[] | null = null;
  let calendarEvents: CalendarEvent[] | null = null;
  let response: Awaited<ReturnType<typeof ollama.chat>>;

  try {
    response = await chatWithRetry({
      model: 'sid:latest',
      messages: currentMessages,
      tools: tools,
    });
  } catch (err) {
    console.error('ollama.chat failed after retries:', err);
    return new Response(
      JSON.stringify({
        message: { role: 'assistant', content: "Couldn't reach my brain just now — give it a second and try again." },
        emailDetails: null,
        calendarEvents: null,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

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

    try {
      response = await chatWithRetry({
        model: 'sid:latest',
        messages: currentMessages,
        tools: tools,
      });
    } catch (err) {
      console.error('ollama.chat failed after retries:', err);
      return new Response(
        JSON.stringify({
          message: { role: 'assistant', content: "Couldn't reach my brain just now — give it a second and try again." },
          emailDetails,
          calendarEvents,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  for (let attempt = 0; looksLikeGarbledToolCall(response.message.content) && attempt < 2; attempt++) {
    console.error('Garbled tool-call-like reply, regenerating:', response.message.content);
    try {
      response = await chatWithRetry({
        model: 'sid:latest',
        messages: currentMessages,
        tools: tools,
      });
    } catch (err) {
      console.error('regeneration after garbled reply failed:', err);
      break;
    }
  }

  if (looksLikeGarbledToolCall(response.message.content)) {
    console.error('Garbled tool-call-like reply persisted after retries:', response.message.content);
    response.message.content = 'Sorry, what was that?';
  }

  return new Response(JSON.stringify({ ...response, emailDetails, calendarEvents }), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function formatEventTime(event) {
  if (event.allDay) {
    const d = new Date(event.start);
    return isNaN(d.getTime()) ? event.start : d.toLocaleDateString();
  }
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (isNaN(start.getTime())) return event.start;
  const startStr = start.toLocaleString();
  const endStr = isNaN(end.getTime())
    ? ''
    : end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return endStr ? `${startStr} – ${endStr}` : startStr;
}

export function CalendarEventsClient({ events, onSelect }) {
  if (!events || events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events in that range.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {events.map((event, i) => (
        <li key={event.id ?? i} className="border-b border-border pb-2 last:border-none">
          <button
            type="button"
            onClick={() => onSelect?.(event)}
            disabled={!event.id}
            className="w-full cursor-pointer text-left disabled:cursor-default"
          >
            <p className="text-sm font-medium">{event.summary}</p>
            <p className="text-xs text-muted-foreground">{formatEventTime(event)}</p>
            {event.location && <p className="text-xs text-muted-foreground">{event.location}</p>}
          </button>
        </li>
      ))}
    </ul>
  );
}

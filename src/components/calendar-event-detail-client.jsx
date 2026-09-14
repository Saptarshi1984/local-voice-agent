'use client';

import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';

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

export function CalendarEventDetailClient({ event, onBack }) {
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="w-fit cursor-pointer gap-1 px-2 text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        Back
      </Button>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">{event.summary}</p>
        <p className="text-xs text-muted-foreground">{formatEventTime(event)}</p>
        {event.location && <p className="text-sm">{event.location}</p>}
        {event.description && (
          <p className="mt-2 text-sm whitespace-pre-wrap">{event.description}</p>
        )}
      </div>
    </div>
  );
}

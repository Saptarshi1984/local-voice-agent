'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';

function formatDate(date) {
  const d = new Date(date);
  return isNaN(d.getTime()) ? date : d.toLocaleString();
}

export function EmailReaderClient({ email, onBack }) {
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    setLoading(true);

    fetch(`/api/emailContent?id=${encodeURIComponent(email.id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
        } else {
          setContent(data);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this email.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [email.id]);

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

      {loading && <p className="text-sm text-muted-foreground">Loading email...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {content && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{content.from}</p>
          <p className="text-sm font-semibold">{content.subject}</p>
          <p className="text-xs text-muted-foreground">{formatDate(content.date)}</p>
          <p className="mt-2 text-sm whitespace-pre-wrap">{content.body}</p>
        </div>
      )}
    </div>
  );
}

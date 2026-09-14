export function EmailsDetailsClient({ emails, onSelect }) {
  if (!emails || emails.length === 0) {
    return <p className="text-sm text-muted-foreground">What's on your mind today?</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {emails.map((email, i) => (
        <li key={email.id ?? i} className="border-b border-border pb-2 last:border-none">
          <button
            type="button"
            onClick={() => onSelect?.(email)}
            disabled={!email.id}
            className="w-full cursor-pointer text-left disabled:cursor-default"
          >
            <p className="text-sm font-medium">{email.from}</p>
            <p className="text-sm">{email.subject}</p>
            <p className="text-xs text-muted-foreground">
              {(() => {
                const d = new Date(email.date);
                return isNaN(d.getTime()) ? email.date : d.toLocaleString();
              })()}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}

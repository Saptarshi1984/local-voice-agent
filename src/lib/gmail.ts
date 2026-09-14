import { google } from 'googleapis';
import credentials from '@/app/data/credentials.json';

function getOAuth2Client() {
  const { client_id, client_secret, redirect_uris } = credentials.installed;
  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return client;
}

function formatGmailDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function resolveUnreadDateQuery(
  startDate?: string,
  endDate?: string,
  daysAgo?: number
): { query: string } | { error: string } {
  let start: Date;
  if (startDate) {
    start = new Date(startDate);
    if (isNaN(start.getTime())) {
      return { error: `"${startDate}" isn't a valid date.` };
    }
  } else if (daysAgo !== undefined) {
    start = new Date();
    start.setDate(start.getDate() - Math.max(0, Number(daysAgo)));
  } else {
    start = new Date();
  }

  let end: Date;
  if (endDate) {
    end = new Date(endDate);
    if (isNaN(end.getTime())) {
      return { error: `"${endDate}" isn't a valid date.` };
    }
  } else if (daysAgo !== undefined && !startDate) {
    end = new Date(); // days_ago defines a range running through today
  } else {
    end = new Date(start);
  }
  end.setDate(end.getDate() + 1); // make the end date inclusive

  return { query: `is:unread after:${formatGmailDate(start)} before:${formatGmailDate(end)}` };
}

async function countMessages(
  gmail: ReturnType<typeof google.gmail>,
  query: string
): Promise<number> {
  let count = 0;
  let pageToken: string | undefined;
  do {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 500,
      pageToken,
    });
    count += listRes.data.messages?.length ?? 0;
    pageToken = listRes.data.nextPageToken ?? undefined;
  } while (pageToken);

  return count;
}

export async function get_unread_email_count(
  startDate?: string,
  endDate?: string,
  daysAgo?: number
): Promise<string> {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return "Email isn't connected — no Google refresh token configured.";
  }

  const range = resolveUnreadDateQuery(startDate, endDate, daysAgo);
  if ('error' in range) {
    return range.error;
  }

  try {
    const gmail = google.gmail({ version: 'v1', auth: getOAuth2Client() });
    const count = await countMessages(gmail, range.query);
    return String(count);
  } catch (err) {
    console.error('get_unread_email_count failed:', err);
    return "Couldn't reach Gmail just now.";
  }
}

export interface EmailDetail {
  id: string;
  from: string;
  subject: string;
  date: string;
}

export async function get_unread_emails_details(
  count: number = 15,
  startDate?: string,
  endDate?: string,
  daysAgo?: number
): Promise<EmailDetail[] | string> {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return "Email isn't connected — no Google refresh token configured.";
  }

  const range = resolveUnreadDateQuery(startDate, endDate, daysAgo);
  if ('error' in range) {
    return range.error;
  }

  try {
    const gmail = google.gmail({ version: 'v1', auth: getOAuth2Client() });

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['INBOX', 'UNREAD'],
      q: range.query,
      maxResults: count,
    });

    const messages = listRes.data.messages ?? [];
    if (messages.length === 0) {
      return [];
    }

    const details = await Promise.all(
      messages.map((m) =>
        gmail.users.messages.get({
          userId: 'me',
          id: m.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        })
      )
    );

    return details.map((detail) => {
      const headers = detail.data.payload?.headers ?? [];
      return {
        id: detail.data.id!,
        from: headers.find((h) => h.name === 'From')?.value ?? 'Unknown sender',
        subject: headers.find((h) => h.name === 'Subject')?.value ?? '(no subject)',
        date: headers.find((h) => h.name === 'Date')?.value ?? 'Unknown date',
      };
    });
  } catch (err) {
    console.error('get_unread_emails_details failed:', err);
    return "Couldn't reach Gmail just now.";
  }
}

export interface EmailContent {
  from: string;
  subject: string;
  date: string;
  body: string;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractBody(payload: any): string {
  if (!payload) return '';

  if (payload.body?.data && (payload.mimeType === 'text/plain' || payload.mimeType === 'text/html')) {
    const decoded = decodeBase64Url(payload.body.data);
    return payload.mimeType === 'text/html' ? stripHtml(decoded) : decoded;
  }

  const parts = payload.parts ?? [];
  const plainPart = parts.find((p: any) => p.mimeType === 'text/plain');
  if (plainPart?.body?.data) return decodeBase64Url(plainPart.body.data);

  const htmlPart = parts.find((p: any) => p.mimeType === 'text/html');
  if (htmlPart?.body?.data) return stripHtml(decodeBase64Url(htmlPart.body.data));

  for (const part of parts) {
    const nested = extractBody(part);
    if (nested) return nested;
  }

  return '';
}

export async function get_email_content(id: string): Promise<EmailContent | string> {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return "Email isn't connected — no Google refresh token configured.";
  }

  try {
    const gmail = google.gmail({ version: 'v1', auth: getOAuth2Client() });
    const res = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'full',
    });

    const headers = res.data.payload?.headers ?? [];
    return {
      from: headers.find((h) => h.name === 'From')?.value ?? 'Unknown sender',
      subject: headers.find((h) => h.name === 'Subject')?.value ?? '(no subject)',
      date: headers.find((h) => h.name === 'Date')?.value ?? 'Unknown date',
      body: extractBody(res.data.payload) || '(no readable content)',
    };
  } catch (err) {
    console.error('get_email_content failed:', err);
    return "Couldn't reach Gmail just now.";
  }
}

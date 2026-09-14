// One-time Gmail OAuth setup. Run with `npm run auth:google`.
// Reads src/app/data/credentials.json, walks you through Google's consent
// screen via a temporary local server, then writes the refresh token to
// .env.local as GOOGLE_REFRESH_TOKEN.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { google } from 'googleapis';

const PORT = 43219;
const REDIRECT_URI = `http://localhost:${PORT}`;
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TIMEOUT_MS = 5 * 60 * 1000;

const credentialsPath = path.resolve(process.cwd(), 'src/app/data/credentials.json');

function loadCredentials() {
  if (!fs.existsSync(credentialsPath)) {
    console.error(
      `credentials.json not found at ${credentialsPath} — download it from Google Cloud Console (OAuth client, type "Desktop app") and place it there.`
    );
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const { client_id, client_secret } = raw.installed ?? {};
  if (!client_id || !client_secret) {
    console.error('credentials.json is missing installed.client_id / installed.client_secret.');
    process.exit(1);
  }
  return { client_id, client_secret };
}

function updateEnvLocal(refreshToken) {
  const envPath = path.resolve(process.cwd(), '.env.local');
  let content = '';
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const line = `GOOGLE_REFRESH_TOKEN=${refreshToken}`;
  if (/^GOOGLE_REFRESH_TOKEN=.*$/m.test(content)) {
    content = content.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, line);
  } else {
    if (content.length > 0 && !content.endsWith('\n')) content += '\n';
    content += `${line}\n`;
  }

  fs.writeFileSync(envPath, content, 'utf8');
}

async function main() {
  const { client_id, client_secret } = loadCredentials();
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  console.log('\nOpen this URL in a browser and approve access:\n');
  console.log(authUrl);
  console.log(`\nWaiting for authorization on ${REDIRECT_URI} ...\n`);

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for authorization.'));
    }, TIMEOUT_MS);

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<p>Authorization failed. You can close this tab and check the terminal.</p>');
        clearTimeout(timeout);
        server.close();
        reject(new Error(`Google returned an error: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(204);
        res.end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<p>Authorization complete — you can close this tab.</p>');
      clearTimeout(timeout);
      server.close();

      try {
        const { tokens } = await oAuth2Client.getToken(code);
        if (!tokens.refresh_token) {
          reject(
            new Error(
              'Google did not return a refresh token. Revoke prior access at https://myaccount.google.com/permissions and retry.'
            )
          );
          return;
        }
        resolve(tokens.refresh_token);
      } catch (err) {
        reject(err);
      }
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${PORT} is already in use — close whatever is using it and retry.`));
      } else {
        reject(err);
      }
    });

    server.listen(PORT, 'localhost');
  }).then((refreshToken) => {
    updateEnvLocal(refreshToken);
    console.log(`Refresh token saved to .env.local (${refreshToken.slice(0, 8)}...).`);
  });
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

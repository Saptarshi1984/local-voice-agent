export async function POST(request: Request) {
  const { text } = await request.json();

  const res = await fetch('http://127.0.0.1:8001/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  const audio = await res.arrayBuffer();

  return new Response(audio, {
    headers: { 'Content-Type': 'audio/wav' },
  });
}

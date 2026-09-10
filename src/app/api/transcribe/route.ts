export async function POST(request: Request) {
  const formData = await request.formData();
  const audio = formData.get('audio') as Blob;

  const upsteam = new FormData();
  upsteam.append('file', audio, 'recording.webm');

  const res = await fetch('http://127.0.0.1:8001/transcribe', {
    method: 'POST',
    body: upsteam,
  });

  const data = await res.json();

  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

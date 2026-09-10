import ollama from "ollama";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const response = await ollama.chat({
    model: "sid:latest",
    messages,
  });

  return new Response(JSON.stringify(response), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}

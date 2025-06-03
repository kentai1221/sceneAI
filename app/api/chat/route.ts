import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const apiKey = process.env.AZURE_OPENAI_API_KEY!;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT!;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION!;

  const payload = {
    messages,
  };

  try {
    const response = await fetch(
      `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify(payload),
      }
    );

    const json = await response.json();
    const reply = json?.choices?.[0]?.message?.content || "No response";
    return NextResponse.json({ result: reply });
  } catch (err) {
    return NextResponse.json({ error: "Failed to call Azure OpenAI", detail: String(err) }, { status: 500 });
  }
}

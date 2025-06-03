import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { image } = body;

  const apiKey = process.env.AZURE_OPENAI_API_KEY!;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT!;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION!;

  const payload = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What's in this image?" },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${image}`,
            },
          },
        ],
      },
    ],
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
    console.log("Response from Azure OpenAI:", json);
    const answer = json?.choices?.[0]?.message?.content || "No answer";

    return NextResponse.json({ result: answer });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to call Azure OpenAI", detail: String(err) },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { imagePayload } = await req.json();

    if (!imagePayload) {
      return NextResponse.json(
        { error: "Missing imagePayload in request body" },
        { status: 400 }
      );
    }

    const apiKey = process.env.AZURE_OPENAI_API_KEY!;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT!;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION!;

    const response = await fetch(
      `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify(imagePayload),
      }
    );

    const json = await response.json();

    const result = json?.choices?.[0]?.message?.content;
    if (!result) {
      console.error("Azure returned empty content:", JSON.stringify(json, null, 2));
      return NextResponse.json({ error: "No content returned" }, { status: 500 });
    }

    return NextResponse.json({ result });
  } catch (err) {
    console.error("Azure OpenAI error:", err);
    return NextResponse.json(
      { error: "Failed to call Azure OpenAI", detail: String(err) },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const apiKey = process.env.AZURE_OPENAI_API_KEY!;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT!;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION!;

  const OPENROUTER_apiKey = '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';
  const OPENROUTER_model = "qwen/qwen2.5-vl-3b-instruct:free";

  const payload = {
    //model: OPENROUTER_model, //qwen
    messages,
  };

  try {
    //Azure
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

    //qwen
    // const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     Authorization: `Bearer ${OPENROUTER_apiKey}`,
    //   },
    //   body: JSON.stringify(payload),
    // });

    //  if (!response.ok) {
    //   const errorText = await response.text();
    //   return NextResponse.json({ error: "OpenRouter API Error", detail: errorText }, { status: response.status });
    // }

    const json = await response.json();
    const reply = json?.choices?.[0]?.message?.content || "No response";
    console.log("Response:", reply);
    return NextResponse.json({ result: reply });
  } catch (err) {
    return NextResponse.json({ error: "Failed to call Azure OpenAI", detail: String(err) }, { status: 500 });
  }
}

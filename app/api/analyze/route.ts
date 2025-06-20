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
    const OPENROUTER_apiKey = process.env.QWEN_API_KEY!;
    const OPENROUTER_model = "qwen/qwen2.5-vl-72b-instruct:free";

    const AI = process.env.AI_PROVIDER || "azure";
    let response;

    //Azure
    if (AI === "azure") {
        response = await fetch(
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
      }
    else {

      //qwen
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_apiKey}`,
        },
        body: JSON.stringify({
          model: OPENROUTER_model,
          messages: imagePayload.messages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json(
          { error: "OpenRouter API error", detail: errorText },
          { status: response.status }
        );
      }
    }

    const json = await response.json();

    const result = json?.choices?.[0]?.message?.content;
    console.log("Response:", result);
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

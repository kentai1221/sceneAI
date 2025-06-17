import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { messages, sceneData } = await req.json();

  const hasScene = Array.isArray(sceneData) && sceneData.length > 0;

  if (!hasScene) {
    return NextResponse.json({
      result: "❗ Please upload one or more images of a 7-Eleven store or a layout sketch before continuing.",
    });
  }

  // 🧠 Build system message with the current scene
  const systemMessage = {
    role: "system",
    content: `You are a 3D scene assistant.

The current 3D scene is provided below as a JSON array.

Your job is to modify this scene according to the user's request and return a **complete updated JSON array**.

💡 Rules:
- Always return only a JSON array (no explanation, no markdown)
- Add your reply message in a \`message\` field inside the floor object (first object)
- Do not change unchanged objects unless asked
- Maintain correct formatting: type, position, rotation, scale, color

- Never place objects outside the floor boundaries:
  - X ∈ [-W/2, W/2]
  - Z ∈ [-D/2, D/2]
- Always set object Y-position = scale.y / 2 so it sits on the floor
- Do not add multiple objects of the same type unless specifically asked

📦 Current Scene:
${JSON.stringify(sceneData, null, 2)}
`,
  };

  const fullMessages = [systemMessage, ...messages];

  const apiKey = process.env.AZURE_OPENAI_API_KEY!;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT!;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION!;
  const OPENROUTER_apiKey = process.env.QWEN_API_KEY!;
  const OPENROUTER_model = "qwen/qwen2.5-vl-72b-instruct:free";
  const AI = process.env.AI_PROVIDER || "azure";

  try {
    let response;

    if (AI === "azure") {
      response = await fetch(
        `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": apiKey,
          },
          body: JSON.stringify({ messages: fullMessages }),
        }
      );
    } else {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_apiKey}`,
        },
        body: JSON.stringify({
          model: OPENROUTER_model,
          messages: fullMessages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json(
          { error: "OpenRouter API Error", detail: errorText },
          { status: response.status }
        );
      }
    }

    const json = await response.json();
    const reply = json?.choices?.[0]?.message?.content || "No response";
    console.log("Response:", reply);
    return NextResponse.json({ result: reply });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to call AI", detail: String(err) },
      { status: 500 }
    );
  }
}

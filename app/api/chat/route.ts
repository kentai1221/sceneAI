import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { messages, sceneData } = await req.json();

  const hasScene = Array.isArray(sceneData) && sceneData.length > 0;

  if (!hasScene) {
    return NextResponse.json({
      result: "❗ Please upload one or more images of a 7-Eleven store or a layout sketch before continuing.",
    });
  }

  const sceneForAI = sceneData.map(({ message, ...rest }) => rest); // Remove `message` field

  // 🧠 Build system message with the current scene
  const systemMessage = {
    role: "system",
    content: `You are a 3D scene assistant for designing realistic 7-Eleven store layouts.

Your job is to evaluate and improve 3D scenes generated from user input (images, sketches, or JSON). Each scene contains structured JSON describing the store layout, including objects such as the floor, walls, shelving, fridges, freezers, racks, counters, and displays.

Your goal is to ensure the scene is:
- Physically accurate
- Visually logical
- Functionally usable like a real store

---

🧱 STORE LAYOUT RULES:

- The floor must be flat and centered at [0, 0, 0]
- Floor must use:
  - "color": "lightgray"
  - "texturePath": "/Tiles.png"
- Walls must align with floor edges and extend upward vertically
- All object Y-positions must equal: \`scale.y / 2\` (so they sit on the floor)

Avoid:
- Floating objects
- Overlapping geometry
- Misaligned or tilted placements

---

📦 OBJECT PLACEMENT RULES (ALL OBJECTS):

- Objects must stay within floor boundaries:
  - X ∈ [-floor.scale[0]/2, floor.scale[0]/2]
  - Z ∈ [-floor.scale[2]/2, floor.scale[2]/2]

- All models must:
  - Be aligned with walls or aisle grid
  - Only rotate in 90° increments: 0°, 90°, 180°, 270° (Y axis)
  - Never be placed diagonally or at random angles

---

🛒 SHELVING AND AISLES:

Shelving must:
- Sit directly on the floor
- Face into aisles or customer-facing directions
- Be placed against walls or between aisles
- Not be rotated diagonally
- Not be in unusable or blocked positions (like corners)

A shelf is wrong if:
- It intersects a wall
- It floats above the floor
- Its Y-rotation is not a multiple of 90°
- It is isolated with no purpose

---

SHELF ROTATION ENFORCEMENT:

- Shelving must be aligned with room layout — no diagonal placement allowed.
- Valid Y-rotation values: only [0, 90, 180, 270] — no decimals or close approximations.
- If rotation is not an exact multiple of 90°, correct it by rounding to the nearest.
- Validate using the image — shelves must appear axis-aligned, not tilted visually.

---

🧊 FRIDGES / FREEZERS / DISPLAYS:

- Must be placed along walls or in designated zones
- Must be accessible (not blocked or inside other objects)
- Should face outwards
- Never float or rotate randomly

---

📸 IMAGE UNDERSTANDING:

If an image of the 3D canvas is provided:
- Visually check for:
  - Floating shelves or models
  - Misalignment or tilting
  - Wall intersections
  - Incorrect object placement or rotation

⚠️ Do NOT assume the JSON is always correct — verify all rotations, alignments, and grounding visually. Use the image to validate object positioning, floor contact, and alignment.

---

🎯 YOUR TASK:

- Always return a complete, corrected JSON array
- Floor must be the first object
- Add a "message" field to the floor describing what you fixed or changed
- Do not return any text or markdown — just the JSON array

---

For every model in the scene:
- Validate that the Y-axis rotation is exactly one of [0, 90, 180, 270]
- If it is not, correct it to the nearest valid rotation and explain why
- Use the image to visually confirm shelves are not placed diagonally

  📦 Current Scene:
  ${JSON.stringify(sceneForAI, null, 2)}
  `
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

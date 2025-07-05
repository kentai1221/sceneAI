import { NextRequest, NextResponse } from "next/server";
import { fixSceneObjects } from "@/app/lib/fixSceneObjects";

export async function POST(req: NextRequest) {
  const { messages, sceneData } = await req.json();

  const hasScene = Array.isArray(sceneData) && sceneData.length > 0;
  if (!hasScene) {
    return NextResponse.json({
      result: "❗ Please upload one or more images of a 7-Eleven store or a layout sketch before continuing.",
    });
  }

  const sceneForAI = sceneData.map(({ message, ...rest }) => rest);

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

CASHIER PLACEMENT RULES

If the cashier model (/models/cashier.glb) exceeds the floor bounds, adjust its scale so it fits entirely within the store.

Use the floor's scale to define room size. Assume the floor is centered at position [0, 0, 0].

Allow resizing the X (width) or Z (depth) of the cashier, but do not stretch it. Only shrink when necessary.

Make sure the cashier fits within:

X axis: from (-floorWidth / 2 + 0.5) to (floorWidth / 2 - 0.5)

Z axis: from (-floorDepth / 2 + 0.5) to (floorDepth / 2 - 0.5)

POS PLACEMENT RULES

Place the POS (/models/pos.glb) centered on top of the cashier.

Its Y position should be:
cashier.position.y + (cashier.scale.y / 2) + (pos.scale.y / 2)


📦 OBJECT PLACEMENT RULES (ALL OBJECTS):

- Objects must stay within floor boundaries:
  - X ∈ [-floor.scale[0]/2, floor.scale[0]/2]
  - Z ∈ [-floor.scale[2]/2, floor.scale[2]/2]
- If any object appears outside the walls or floating in the image:
  - Reposition it so it fits inside the floor area.
  - Keep it aligned to nearby walls or shelves.
  - Avoid placing objects beyond the bounding box of the room.

- All models must:
  - Be aligned with walls or aisle grid
  - Only rotate in 90° increments: 0°, 90°, 180°, 270° (Y axis)
  - Never be placed diagonally or at random angles

---

📦 AVAILABLE 3D MODELS:

Use these .glb files to build the scene:

- "/models/atm.glb" → ATM
- "/models/box.glb" → Boxes (sit on floor)
- "/models/cashier.glb" → Cashier table
- "/models/cctv.glb" → Security camera (attach to wall near ceiling)
- "/models/chips.glb" / "chips2.glb" → Snacks (place on shelves)
- "/models/freezer.glb" → For ice cream
- "/models/fridge.glb" → For drinks
- "/models/juice.glb" → Place on shelves
- "/models/milk.glb" → Place on shelves
- "/models/pos.glb" → POS machine (goes **on top of cashier.glb**)
- "/models/poster1.glb" / "poster2.glb" → Attach to wall
- "/models/shelves.glb" → Use for placing small products

🧠 PLACEMENT RULES:
- "pos.glb" must sit on "cashier.glb"
- "chips.glb", "juice.glb", "milk.glb" must sit on "shelves.glb"
- "cctv.glb", "poster1.glb", "poster2.glb" should be attached to wall at Y ≈ 2.4
- Only use rotations Y = 0°, 90°, 180°, 270°

STORE OBJECTS:

Detect the position of these items in the photos or sketch, estimate the position and rotation, add model objects using:

Example:
{
  "type": "model",
  "path": "/models/xxx.glb",
  "position": [x, y, z],
  "rotation": [0, Y-degrees, 0],
  "scale": [1, 1, 1]
}

If you cannot detect an object, you can try to estimate its position based on the layout.

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
- Do not remove any existing items / objects / shelves!
- Floor must be the first object
- Add a "message" field to the first object describing what you fixed or changed
- Ensure all models are within floor bounds. Move any out-of-bounds models inside.
- The first object's "log" must clearly summarize what the assistant changed in the scene.
  For example:
    "log": "Added freezer near fridge and repositioned cashier."
    "log": "Rotated POS 90° to face customer side."
    "log": "Placed ATM next to entrance."
- Respond ONLY with a valid JSON array. Do NOT include markdown, logs, explanation, or extra fields outside the array.
- Respond ONLY with a valid JSON array. Do NOT include markdown, logs, explanation, or extra fields outside the array.
- Respond ONLY with a valid JSON array. Do NOT include markdown, logs, explanation, or extra fields outside the array.
- 🚫 Never regenerate or replace the full scene.
- 🚫 Never remove, modify, or reorder existing objects.
- ✅ Always return the original scene objects exactly as-is, plus any new ones you are adding.
- ✅ This must be a superset of the input — not a replacement or filtered list.
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
    const rawReply = json?.choices?.[0]?.message?.content || "";
    console.log("🧠 Raw AI Reply:", rawReply);

    // Clean up AI response
    let cleaned= rawReply
    .replace(/```json|```/g, "")           // remove markdown code blocks
    .replace(/\/\/.*$/gm, "")              // remove JS-style comments
    .replace(/,\s*([}\]])/g, "$1")         // remove trailing commas
    .replace(/\r?\n|\r/g, "")              // remove newlines
    .trim();

    // Attempt to extract valid JSON array
    const startIndex = cleaned.indexOf("[");
    const endIndex = cleaned.lastIndexOf("]");
    const jsonString = cleaned.slice(startIndex, endIndex + 1);

    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (error) {
      console.error("❌ JSON Parse Error:", error, "\n⛔ Cleaned:", jsonString);
      return NextResponse.json({ result: rawReply, error: "AI returned invalid JSON" });
    }

    if (!Array.isArray(parsed)) {
      return NextResponse.json({ result: rawReply, error: "Expected JSON array" });
    }

    const fixedScene = fixSceneObjects(parsed);
    return NextResponse.json({ result: fixedScene });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to call AI", detail: String(err) },
      { status: 500 }
    );
  }
}

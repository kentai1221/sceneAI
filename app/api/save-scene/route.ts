import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const { sceneData } = await req.json();

    const filePath = path.join(process.cwd(), "public", "scene.json");

    await writeFile(filePath, JSON.stringify(sceneData, null, 2));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error saving scene:", err);
    return new NextResponse("Failed to save scene", { status: 500 });
  }
}

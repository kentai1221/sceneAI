import { NextRequest } from 'next/server';
import { readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NodeIO } from '@gltf-transform/core';

export const runtime = 'node'; // ✅ Required for App Router on server side

export async function GET(req: NextRequest) {
  const modelDir = join(process.cwd(), 'public/models');
  const files = readdirSync(modelDir).filter(file => file.endsWith('.glb'));

  const io = new NodeIO();
  const modelMeta: Record<string, any> = {};

  for (const file of files) {
    const glbPath = join(modelDir, file);
    let doc;

    try {
      doc = io.read(glbPath);
    } catch (e) {
      console.error(`❌ Failed to read ${file}:`, e);
      continue;
    }

    const root = (await doc).getRoot();
    const scene = root.getDefaultScene();
    if (!scene) continue;

    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];

    for (const node of scene.listChildren()) {
      const mesh = node.getMesh();
      if (!mesh) continue;

      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;

        const accessor = pos.getArray();
        if (!accessor) continue;

        for (let i = 0; i < accessor.length; i += 3) {
          min[0] = Math.min(min[0], accessor[i]);     // X
          min[1] = Math.min(min[1], accessor[i + 1]); // Y
          min[2] = Math.min(min[2], accessor[i + 2]); // Z

          max[0] = Math.max(max[0], accessor[i]);
          max[1] = Math.max(max[1], accessor[i + 1]);
          max[2] = Math.max(max[2], accessor[i + 2]);
        }
      }
    }

    const size: [number, number, number] = [
      +(max[0] - min[0]).toFixed(2), // width (X)
      +(max[1] - min[1]).toFixed(2), // height (Y)
      +(max[2] - min[2]).toFixed(2)  // depth (Z)
    ];

    // Infer front direction based on shape
    let front: "Z+" | "X+" | null = null;
    if (size[2] > size[0]) {
      front = "Z+";
    } else {
      front = "X+";
    }

    modelMeta[`/models/${file}`] = {
      size,
      front,
      description: "TODO: Add human-readable description"
    };
  }

  // Save metadata to file
  const outputPath = join(modelDir, 'meta.json');
  writeFileSync(outputPath, JSON.stringify(modelMeta, null, 2));

  return new Response(JSON.stringify(modelMeta, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

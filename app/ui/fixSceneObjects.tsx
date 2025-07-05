import rawMetaJson from "@/public/models/meta.json";

export type SceneItem = {
  type: "box" | "model";
  path?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color?: string;
  texturePath?: string;
  message?: string;
  material?: string;
};

export type ModelMeta = {
  size: [number | null, number | null, number | null] | null;
  front: "X+" | "X-" | "Z+" | "Z-";
  description?: string;
};

const ROTATION_FROM_FRONT: Record<ModelMeta["front"], number> = {
  "X+": 90,
  "X-": 270,
  "Z+": 0,
  "Z-": 180,
};

function getNextBoxPosition(
  existingBox: SceneItem,
  direction: "left" | "right" | "front" | "back" = "right"
): [number, number, number] {
  const meta = modelMeta[existingBox.path!];
  const size = meta?.size ?? [0.5, 0.5, 0.5];
  const spacing = 0.1;

  const [x, y, z] = existingBox.position ?? [0, 0, 0];
  const [w = 0.5, , d = 0.5] = size;

  switch (direction) {
    case "left":
      return [x - w - spacing, y, z];
    case "right":
      return [x + w + spacing, y, z];
    case "front":
      return [x, y, z - d - spacing];
    case "back":
      return [x, y, z + d + spacing];
    default:
      return [x + w + spacing, y, z];
  }
}

function createProductRow(
  path: string,
  startX: number,
  y: number,
  z: number,
  count: number,
  spacing: number
): SceneItem[] {
  const items: SceneItem[] = [];

  for (let i = 0; i < count; i++) {
    items.push({
      type: "model",
      path,
      position: [startX + i * spacing, y, z],
      rotation: [0, 0, 0],
    });
  }

  return items;
}

// ✅ Safely normalize raw meta
const modelMeta: Record<string, ModelMeta> = Object.fromEntries(
  Object.entries(rawMetaJson).map(([key, val]) => {
    let size: [number | null, number | null, number | null] | null = null;

    if (Array.isArray(val.size) && val.size.length === 3) {
      size = val.size.map((v) => (typeof v === "number" ? v : null)) as [number | null, number | null, number | null];
    }

    return [
      key,
      {
        size,
        front: val.front as "X+" | "X-" | "Z+" | "Z-",
        description: val.description ?? "",
      },
    ];
  })
);


export function fixSceneObjects(sceneData: SceneItem[]): SceneItem[] {
  const floor = sceneData.find((obj) => obj.type === "box" && obj.position?.[1] === 0);
  const floorSize = floor?.scale ?? [10, 0.1, 10];
  const halfW = floorSize[0] / 2;
  const halfD = floorSize[2] / 2;

  let cashier: SceneItem | undefined;

  const fixed = sceneData.map((obj) => {
    if (obj.type !== "model" || !obj.path) return obj;

    const meta = modelMeta[obj.path];
    const fixedObj = { ...obj };

    // 🔄 Apply front-based rotation
    if (meta?.front) {
      fixedObj.rotation = [0, ROTATION_FROM_FRONT[meta.front] ?? 0, 0];
    }

    // 🧭 Snap Y-rotation to 0/90/180/270
    if (fixedObj.rotation) {
      fixedObj.rotation[1] = Math.round(fixedObj.rotation[1] / 90) * 90;
    }

    // ⛔ Clamp within floor bounds
    if (fixedObj.position && meta?.size) {
      const [x, y, z] = fixedObj.position;
      const [w = 1, , d = 1] = meta.size;

      fixedObj.position[0] = Math.max(-halfW + w / 2, Math.min(x, halfW - w / 2));
      fixedObj.position[2] = Math.max(-halfD + d / 2, Math.min(z, halfD - d / 2));
    }

    // 💾 Save cashier
    if (obj.path === "/models/cashier.glb") {
      cashier = fixedObj;
    }

    if (obj.path === "/models/poster1.glb") {
      fixedObj.position = [fixedObj.position?.[0] ?? 0, 1.78, fixedObj.position?.[2] ?? 0];
    }
    
    if (obj.path === "/models/poster2.glb") {
      fixedObj.position = [fixedObj.position?.[0] ?? 0, 1.43, fixedObj.position?.[2] ?? 0];
    }

    return fixedObj;
  });

  const pos = fixed.find((obj) => obj.path === "/models/pos.glb");

  if (pos && cashier) {
    const [cx, , cz] = cashier.position ?? [0, 0, 0];
  
    const cashierFront = modelMeta[cashier.path!]?.front ?? "X+";
    const posFront = modelMeta[pos.path!]?.front ?? "Z+";
  
    const cashierRot = ROTATION_FROM_FRONT[cashierFront];
    const posRot = ROTATION_FROM_FRONT[posFront];
  
    // Rotation needed to match cashier + flip
    const rotationDiff = (cashierRot - posRot + 180 + 360) % 360;
  
    pos.position = [cx, 0.94, cz];
    pos.rotation = [0, rotationDiff, 0];
  }

  const allBoxes = fixed.filter(obj => obj.path === "/models/box.glb");

  if (allBoxes.length === 2) {
    const [first, second] = allBoxes;
    if (!second.position) {
      second.position = getNextBoxPosition(first, "right");
    }
  }

  const productPaths = [
    "/models/chips.glb",
    "/models/chips2.glb",
    "/models/juice.glb",
    "/models/milk.glb"
  ];
  
  const yOffset = 0.9;
  
  const shelfObjects = fixed.filter(obj => obj.path === "/models/shelves.glb");
  
  shelfObjects.forEach((shelf, index) => {
    const [sx, sy, sz] = shelf.position ?? [0, 0, 0];
    const rotY = shelf.rotation?.[1] ?? 0;
  
    const shelfSize = modelMeta[shelf.path!]?.size ?? [1, 1, 1];
    const shelfWidth = shelfSize[0] ?? 1;
    const shelfDepth = shelfSize[2] ?? 1;
    const shelfHeight = shelfSize[1] ?? 1;
  
    const levels = 5;
    const itemsPerLevel = Math.floor(shelfWidth / 0.22);
    const spacingX = shelfWidth / itemsPerLevel;
  
    // Assign product type per-shelf based on index
    const productPath = productPaths[index % productPaths.length];
  
    for (let level = 0; level < levels; level++) {
      const y = sy - shelfHeight / 2 + 0.25 + level * (shelfHeight / levels) + yOffset;
  
      for (let i = 0; i < itemsPerLevel; i++) {
        const xOffset = -shelfWidth / 2 + spacingX / 2 + i * spacingX;
        const zOffset = 0.25;
  
        const [x, z] = rotY === 0 || rotY === 180
          ? [sx + xOffset, sz + (rotY === 0 ? zOffset : -zOffset)]
          : [sx + (rotY === 90 ? -zOffset : zOffset), sz + xOffset];
  
        fixed.push({
          type: "model",
          path: productPath,
          position: [x, y, z],
          rotation: [0, rotY, 0],
          scale: [1, 1, 1]
        });
      }
    }
  });
  
  

  return fixed;
}

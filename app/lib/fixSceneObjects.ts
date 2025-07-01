export type SceneItem = {
    type: "box" | "model";
    path?: string;
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    color?: string;
    texturePath?: string;
    material?: "reflective";
    message?: string;
  };

  
  export function fixSceneObjects(scene: SceneItem[]): SceneItem[] {
    const cashier = scene.find((o) => o.path === "/models/cashier.glb");
    const shelves = scene.find((o) => o.path === "/models/shelves.glb");
  
    const productModels = [
      "/models/chips.glb",
      "/models/chips2.glb",
      "/models/juice.glb",
      "/models/milk.glb",
    ];
  
    return scene.map((obj) => {
      const position = [...(obj.position ?? [0, 0, 0])];
      const scale = obj.scale ?? [1, 1, 1];
      const height = scale[1];
  
      // 🧭 Snap Y-rotation to nearest 90°
      if (obj.rotation) {
        obj.rotation[1] = Math.round(obj.rotation[1] / 90) * 90;
      }
  
      // 🖥️ Place POS on cashier table
      if (obj.path === "/models/pos.glb" && cashier) {
        const [cx, cy, cz] = cashier.position ?? [0, 0, 0];
        const ch = cashier.scale?.[1] ?? 1;
        obj.position = [cx, cy + ch / 2 + height / 2, cz];
      }
  
      // 🧃 Place products on shelves
      if (productModels.includes(obj.path || "") && shelves) {
        const [sx, sy, sz] = shelves.position ?? [0, 0, 0];
        const sh = shelves.scale?.[1] ?? 1;
        obj.position = [sx, sy + sh / 2 + height / 2, sz];
      }
  
      // 📦 Ensure box sits on floor
      if (obj.path === "/models/box.glb") {
        obj.position = [position[0], height / 2, position[2]];
      }
  
      // 🖼️ Place wall objects high on wall (CCTV/posters)
      const wallMounted = [
        "/models/cctv.glb",
        "/models/poster1.glb",
        "/models/poster2.glb",
      ];
      if (wallMounted.includes(obj.path || "")) {
        obj.position = [position[0], 2.4, position[2]]; // place at top of wall
      }
  
      return obj;
    });
  }
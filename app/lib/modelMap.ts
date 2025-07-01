// app/lib/modelMap.ts

export const MODEL_ALIAS_MAP: Record<string, string> = {
    // Direct mappings
    atm: "/models/atm.glb",
    box: "/models/box.glb",
    cashier: "/models/cashier.glb",
    cctv: "/models/cctv.glb",
    chips: "/models/chips.glb",
    chips2: "/models/chips2.glb",
    freezer: "/models/freezer.glb",
    fridge: "/models/fridge.glb",
    juice: "/models/juice.glb",
    milk: "/models/milk.glb",
    pos: "/models/pos.glb",
    poster1: "/models/poster1.glb",
    poster2: "/models/poster2.glb",
    shelves: "/models/shelves.glb",
  
    // Aliases / synonyms
    "point of sale": "/models/pos.glb",
    "checkout machine": "/models/pos.glb",
    "cashier table": "/models/cashier.glb",
    "security camera": "/models/cctv.glb",
    "camera": "/models/cctv.glb",
    "snack": "/models/chips.glb",
    "ice cream freezer": "/models/freezer.glb",
    "drink cooler": "/models/fridge.glb",
    "milk carton": "/models/milk.glb",
    "juice box": "/models/juice.glb",
    "poster": "/models/poster1.glb",
  };
  
  // Optional helper function
  export function mapUserTextToModelPath(text: string): string | null {
    const lower = text.toLowerCase();
    const entry = Object.entries(MODEL_ALIAS_MAP).find(([alias]) =>
      lower.includes(alias)
    );
    return entry?.[1] ?? null;
  }
  
"use client";
import { useRef, useEffect, useState } from "react";
import SceneCanvas from "@/app/ui/SceneCanvas";
import * as THREE from "three";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import SketchCanvas, { SketchCanvasRef } from "@/app/ui/SketchCanvas";


function getModelSizeFromScene(scene: THREE.Object3D): [number, number, number] {
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  return [size.x, size.y, size.z];  // width, height, depth
}

async function getActualSizeFromGLB(path: string): Promise<[number, number, number]> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      path,
      (gltf) => {
        const scene = gltf.scene;
        const box = new THREE.Box3().setFromObject(scene);
        const size = new THREE.Vector3();
        box.getSize(size);
        resolve([size.x, size.y, size.z]); // [width, height, depth]
      },
      undefined,
      (error) => reject(error)
    );
  });
}

async function loadAndMeasureGLB(path: string): Promise<[number, number, number]> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader(); // make sure it's imported
    loader.load(
      path,
      (gltf) => {
        const scene = gltf.scene;
        const [w, h, d] = getModelSizeFromScene(scene);
        resolve([w, h, d]);
      },
      undefined,
      reject
    );
  });
}

async function measureGLBSize(path: string): Promise<[number, number, number]> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      path,
      (gltf) => {
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = new THREE.Vector3();
        box.getSize(size);
        resolve([size.x, size.y, size.z]); // width, height, depth
      },
      undefined,
      reject
    );
  });
}

type SceneItem = {
  type: "box" | "model";
  path?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color?: string;
  message?: string; // Added message property
  texturePath?: string;
};

export default function Home() {
  const [fileList, setFileList] = useState<File[]>([]);
  const [analysisResponse, setAnalysisResponse] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sceneData, setSceneData] = useState<SceneItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [showSketchModal, setShowSketchModal] = useState(false);
  const sketchCanvasRef = useRef<SketchCanvasRef>(null);

  useEffect(() => {
    fetch("/scene.json")
      .then((res) => res.json())
      .then((data) => setSceneData(data));
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

 const handleUpload = async (sketchBase64?: string) => {
  if (!sketchBase64 && fileList.length === 0) return;

  addChatMessage({ role: "assistant", content: "🧠 Analyzing your images...Please wait!" });
  setAnalysisResponse("🧠 Reading images...");

  let base64Images: string[] = [];

  if (typeof sketchBase64 === "string") {
    // From SketchCanvas
    const splitBase64 = sketchBase64.split(",")[1]; // removes the "data:image/jpeg;base64,"
    base64Images = [splitBase64];
  } else {
    // From uploaded file list
    base64Images = await Promise.all(
      fileList.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result?.toString().split(",")[1] || "";
              resolve(base64);
            };
            reader.readAsDataURL(file);
          })
      )
    );
  }


  try {
    setAnalysisResponse("🧠 Analyzing scene (floor + walls)...");

    const imageParts = base64Images.map((base64) => ({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${base64}` },
    }));

    const combinedPrompt = {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are analyzing one or more images of a 7-Eleven store interior.

These images may include:
- Real-world photos of the store (showing shelves, walls, ceiling, entrances)
- Layout sketches or top-down floorplans
- Photos that include partial structure or open entrances

Your job is to reconstruct the basic structure AND store contents as a 3D scene in JSON format.

---

TASK:

Return a pure JSON array of 3D objects with the following format:

1. A single floor object:
  - type: "box"
  - position: [0, 0, 0]
  - scale: [width, 0.1, depth] (in meters)
  - color: "lightgray"
  - log: "...summary of what you detected..."
  - texturePath: "/Tiles.png"

2. One or more wall objects:
  - type: "box"
  - position: [x, y, z]
  - scale: [x, y, z]
  - rotation: [x, y, z]
  - color: "white"
  - material: "reflective"

3. All other detected store objects (VERY IMPORTANT):
  - type: "model"
  - path: (e.g. "/models/shelves.glb")
  - position: [x, y, z]
  - rotation: [0, Y-degrees, 0]
  - scale: [1, 1, 1]

Do not skip objects like:
- cashier counter
- pos.glb
- shelves
- fridge
- freezer
- cctv
- posters
- snacks and products

If visible or strongly implied, include them using the correct 3D model and estimate their placement.

---

MATERIAL RULES:

- Walls must be white and reflective
- Floor must be lightgray and include texturePath: "/Tiles.png"
- Do NOT make the floor reflective

---

FLOOR EXAMPLE:

{
  "type": "box",
  "position": [0, 0, 0],
  "scale": [10, 0.1, 8],
  "color": "lightgray",
  "texturePath": "/Tiles.png",
  "log": "Floor detected with dimensions 10x8 meters"
}

---

GEOMETRY RULES:

- Floor is centered at [0, 0, 0]
- Walls must be placed with Y = height / 2
- Wall height ≈ 2.5 meters
- Thickness ≈ 0.2 meters
- Units in meters
- No floating or overlapping objects
- Use only rotation angles 0, 90, 180, 270

---

AVAILABLE 3D MODELS:

Use these glb files when objects are present:

- /models/atm.glb
- /models/box.glb
- /models/cashier.glb
- /models/cctv.glb
- /models/chips.glb or chips2.glb
- /models/freezer.glb
- /models/fridge.glb
- /models/juice.glb
- /models/milk.glb
- /models/pos.glb
- /models/poster1.glb or poster2.glb
- /models/shelves.glb

📐 MODEL DIMENSIONS (in meters):

Use these real-world dimensions for the 3D models (width, height, depth):

- atm.glb → [0.55, 1.19, 0.52]
- box.glb → [0.56, 0.45, 0.46]
- cashier.glb → [3.79, 0.93, 0.71]
- cctv.glb → [0.09, 0.23, 0.3]
- chips.glb → [0.19, 0.26, 0.09]
- chips2.glb → [0.21, 0.29, 0.13]
- fridge.glb → [0.76, 1.65, 0.64]
- juice.glb → [0.07, 0.23, 0.07]
- milk.glb → [0.10, 0.20, 0.07]
- pos.glb → [0.44, 0.35, 0.53]
- poster1.glb → [0.31, 0.43, 0.01]
- poster2.glb → [0.89, 1.03, 0.02]
- shelves.glb → [0.97, 2.05, 0.71]

These are the accurate width, height, and depth of each model.

Always place models using these sizes to avoid overlapping or floating.

PLACEMENT RULES:

- pos.glb must sit on top of cashier.glb
- juice.glb, milk.glb, chips.glb must sit on shelves.glb
- cctv and posters must attach to wall at Y ≈ 2.4
- Use rotation: only 0, 90, 180, or 270 degrees

📏 SHELF COMPOSITION RULE:

If the photo shows one long shelf or fridge that is larger than any available model:

- Use **multiple adjacent copies** of smaller models (like "shelves.glb") to simulate it.
- Align them tightly side-by-side to form one continuous unit.
- You may repeat the same model 2–4 times depending on the visual length.
- Keep consistent Y (height) and spacing (small gap or zero gap).

For example, if a shelf in the photo spans ~3 meters and "shelves.glb" is ~1 meter wide, use 3 copies of it in a row.

---
🧱 SHELF DENSITY AND DUPLICATION RULE:

- It is common for 7-Eleven stores to have:
  - 3–4 central aisle shelves (standing individually in the center)
  - 4–5 shelving units along the back wall, often forming a continuous shelf line

- You are allowed and encouraged to **duplicate** "shelves.glb" model:
  - Use multiple copies side-by-side (with 0 or minimal gaps)
  - Align them visually straight and evenly spaced

🧠 EXAMPLE PLACEMENT STRATEGY:

- If you see one long shelf in the image:
  - Place 3 or more shelves.glb copies in a row (aligned on X or Z)
- If there are multiple vertical shelves in front of a wall:
  - Place 4–5 in tight rows close to the wall

📚 SHELF LAYOUT STRATEGY:

- Use **multiple shelves.glb** side-by-side to simulate large shelf rows.
- At the back wall, place 4–5 shelves.glb in a row with tight spacing (Z ≈ wall - depth/2).
- In the center of the store, place 3–4 shelves.glb in a line (Z-direction), perpendicular to the back wall.
- Always align shelves so they do not float or intersect the wall.
- Allow shelf repetition freely, as is common in convenience stores.

 If a shelf is placed against a wall, set its position.z so its back edge touches the wall:
  position.z = wallZ - (shelfDepth / 2);

SCENE FORMAT:

Return ONLY a JSON array with:
- 1 floor object (first)
- N wall objects
- N detected model objects

Every object must include:
- type
- position
- scale
- color
- (optionally) rotation, texturePath, material

Example object:

{
  "type": "model",
  "path": "/models/fridge.glb",
  "position": [2, 0.9, 4],
  "rotation": [0, 90, 0],
  "scale": [1, 1, 1]
}

---

NOTES:

- Use visible cues: alignment, shadows, shapes
- If object is partially visible, you may still include it
- If detection is uncertain, make a best guess

---

Respond ONLY with a valid JSON array. No markdown, code fences, or explanation.`,
            },
            ...imageParts,
          ],
        },
      ],
    };

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagePayload: combinedPrompt }),
    });

    const data = await response.json();
    let sceneObjects: SceneItem[] = [];

    if (typeof data?.result === "string") {
      // If it's a string, clean it and parse it
      const cleaned = data.result.replace(/```json|```/g, "").trim();
      sceneObjects = JSON.parse(cleaned);
    } else if (Array.isArray(data?.result)) {
      // Already parsed JSON array
      sceneObjects = data.result;
    } else {
      throw new Error("Unexpected result format from API");
    }

    setSceneData(sceneObjects);
    setAnalysisResponse("✅ Floor and walls loaded!");
    
    const floor = sceneObjects.find((obj: SceneItem) => obj.type === "box" && obj.position?.[1] === 0);
    if (floor?.message) {
      addChatMessage({ role: "assistant", content: floor.message });
    } else {
      addChatMessage({ role: "assistant", content: "✅ Scene generated." });
    }

  } catch (err) {
    console.error("Upload error:", err);
    setAnalysisResponse("❌ Failed to analyze scene.");
  }
};

  const addChatMessage = (msg: { role: string; content: string | object }) => {
    setChatMessages((prev) => {
      const content = typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content, null, 2); // handle object

      return [...prev, { role: msg.role, content }];
    });
  };

  function getCanvasImage(): string | null {
    const canvas = document.querySelector("canvas");
    if (!canvas) return null;
    return canvas.toDataURL("image/jpeg", 0.9);
  }

  async function fixFloatingModels(sceneData: SceneItem[]): Promise<SceneItem[]> {
    const loader = new GLTFLoader();
  
    return await Promise.all(
      sceneData.map(async (obj:any) => {
        if (obj.type === "model" && obj.path && obj.position) {
          return new Promise<SceneItem>((resolve) => {
            loader.load(obj.path, (gltf) => {
              const temp = gltf.scene.clone();
  
              // Apply scale, rotation, position to match what will be rendered
              if (obj.scale) temp.scale.set(...(obj.scale as [number, number, number]));
              if (obj.rotation) temp.rotation.set(...(obj.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]));
              if (obj.position) temp.position.set(...(obj.position as [number, number, number]));
  
              const box = new THREE.Box3().setFromObject(temp);
              const minY = box.min.y;
  
              const corrected = {
                ...obj,
                position: [...obj.position],
              };
  
              // Shift downward if floating
              if (minY > 0.01) {
                corrected.position[1] -= minY;
              }
  
              resolve(corrected);
            });
          });
        }
        return obj;
      })
    );
  }

 const handleSendMessage = async () => {
  if (!chatInput.trim()) return;

  const canvasImage = getCanvasImage();
  const updatedMessages = [...chatMessages, { role: "user", content: chatInput }];
  setChatMessages(updatedMessages);
  setChatInput("");

  const payloadMessages = [
    {
      role: "user",
      content: [
        { type: "text", text: chatInput },
        ...(canvasImage
          ? [{ type: "image_url", image_url: { url: canvasImage } }]
          : []),
      ],
    },
  ];

  console.log("Payload messages:", payloadMessages);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: payloadMessages, sceneData }),
    });

    const data = await res.json();
    const assistantReply = data?.result || "No response";

    let updatedScene: SceneItem[] | null = null;

    try {
      let parsed: any;

      if (typeof assistantReply === "string") {
        try {
          parsed = JSON.parse(assistantReply);
        } catch (err) {
          console.error("Failed to parse assistantReply:", err);
          addChatMessage({ role: "assistant", content: assistantReply });
          return;
        }
      } else {
        parsed = assistantReply; // already an object
      }

      if (Array.isArray(parsed)) {
        updatedScene = parsed;

        const corrected = await fixFloatingModels(parsed);
        const correctedScene = fixSceneObjects(corrected);

        console.log("✅ Corrected scene from AI:", correctedScene);

        if (Array.isArray(correctedScene) && correctedScene.length > 0) {
          setSceneData([...correctedScene]); // ✅ This updates the canvas

          // 🧠 Extract log/message from floor for chat
          const floor = correctedScene.find(
            (obj) => obj.type === "box" && obj.position?.[1] === 0
          );
          const message = floor?.log || floor?.message || "✅ Scene updated.";

          addChatMessage({
            role: "assistant",
            content: typeof message === "string" ? message : JSON.stringify(message),
          });
        } else {
          console.warn("❗ AI returned empty or invalid scene");
          addChatMessage({
            role: "assistant",
            content: "⚠️ Received invalid scene from AI.",
          });
        }
      } else {
        // If not an array, just show the assistant's message
        addChatMessage({ role: "assistant", content: assistantReply });
      }
    } catch (e) {
      console.error("❌ Failed to parse assistant reply as JSON:", e);
      addChatMessage({ role: "assistant", content: assistantReply });
    }
  } catch (err) {
    console.error("❌ Failed to fetch from /api/chat:", err);
    addChatMessage({
      role: "assistant",
      content: "❌ Something went wrong contacting the AI service.",
    });
  }
};


  const handleSaveScene = async () => {
    const res = await fetch("/api/save-scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneData }),
    });

    if (res.ok) {
      alert("Scene saved successfully!");
    } else {
      alert("Failed to save scene.");
    }
  };

  // 🧠 Control helpers
  const moveObject = (axis: number, delta: number) => {
    setSceneData((prev) => {
      const updated = [...prev];
      const obj = { ...updated[selectedIndex] };
      obj.position = [...(obj.position ?? [0, 0, 0])];
      obj.position[axis] += delta;
      updated[selectedIndex] = obj;
      return updated;
    });
  };
  
  const rotateObject = (axis: number, delta: number) => {
    setSceneData((prev) => {
      const updated = [...prev];
      const obj = { ...updated[selectedIndex] };
      obj.rotation = [...(obj.rotation ?? [0, 0, 0])];
      obj.rotation[axis] += delta;
      updated[selectedIndex] = obj;
      return updated;
    });
  };

  const scaleObject = (factor: number) => {
    setSceneData((prev) => {
      const updated = [...prev];
      const obj = updated[selectedIndex];
      if (!obj.scale) obj.scale = [1, 1, 1];
      obj.scale = obj.scale.map((v) => Math.max(0.1, v * factor)) as [number, number, number];
      return updated;
    });
  };

  const scaleAxis = (axis: number, factor: number) => {
    setSceneData((prev) => {
      const updated = [...prev];
      const obj = { ...updated[selectedIndex] };
      obj.scale = [...(obj.scale ?? [1, 1, 1])];
      obj.scale[axis] = Math.max(0.1, obj.scale[axis] * factor);
      updated[selectedIndex] = obj;
      return updated;
    });
  };

  const resetObject = () => {
    setSceneData((prev) => {
      const updated = [...prev];
      updated[selectedIndex] = {
        ...updated[selectedIndex],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      };
      return updated;
    });
  };

  const analyzeSketch = async (base64: string) => {
    addChatMessage({ role: "assistant", content: "🧠 Analyzing your sketch..." });
  
    const imagePayload = {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `This is a sketch of a 7-Eleven store layout. Analyze it and return a JSON array of floor and wall objects, plus any shelving or estimates. Respond ONLY with the scene array.`,
            },
            {
              type: "image_url",
              image_url: { url: base64 },
            },
          ],
        },
      ],
    };
  
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePayload }),
      });
  
      const data = await response.json();
      let sceneObjects: SceneItem[] = [];

      if (typeof data?.result === "string") {
        // If it's a string, clean it and parse it
        const cleaned = data.result.replace(/```json|```/g, "").trim();
        sceneObjects = JSON.parse(cleaned);
      } else if (Array.isArray(data?.result)) {
        // Already parsed JSON array
        sceneObjects = data.result;
      } else {
        throw new Error("Unexpected result format from API");
      }
  
      setSceneData(sceneObjects);
      setAnalysisResponse("✅ Scene from sketch loaded!");
  
      const floor = sceneObjects.find((obj: SceneItem) => obj.type === "box" && obj.position?.[1] === 0);
      if (floor?.message) {
        addChatMessage({ role: "assistant", content: floor.message });
      } else {
        addChatMessage({ role: "assistant", content: "✅ Scene generated from sketch." });
      }
    } catch (err) {
      console.error("Sketch analysis failed:", err);
      setAnalysisResponse("❌ Failed to analyze sketch.");
      addChatMessage({ role: "assistant", content: "❌ Could not process your sketch." });
    }
  };

  function fixSceneObjects(sceneData: SceneItem[]): SceneItem[] {
    const cashier = sceneData.find(o => o.path === "/models/cashier.glb");
    const shelves = sceneData.find(o => o.path === "/models/shelves.glb");
  
    return sceneData.map(obj => {
      // Snap rotation to 0, 90, 180, 270
      if (obj.rotation) {
        obj.rotation[1] = Math.round(obj.rotation[1] / 90) * 90;
      }
  
      // Place POS on cashier
      if (obj.path === "/models/pos.glb" && cashier) {
        const [cx, cy, cz] = cashier.position ?? [0, 0, 0];
        const cashierHeight = cashier.scale?.[1] ?? 1;
        const posHeight = obj.scale?.[1] ?? 1;
        obj.position = [cx, cy + cashierHeight / 2 + posHeight / 2, cz];
      }
  
      // Place products on shelves
      const productModels = [
        "/models/chips.glb",
        "/models/chips2.glb",
        "/models/milk.glb",
        "/models/juice.glb",
      ];
  
      if (productModels.includes(obj.path || "") && shelves) {
        const [sx, sy, sz] = shelves.position ?? [0, 0, 0];
        const shelfHeight = shelves.scale?.[1] ?? 1;
        const itemHeight = obj.scale?.[1] ?? 1;
        obj.position = [sx, sy + shelfHeight / 2 + itemHeight / 2, sz];
      }
  
      return obj;
    });
  }



  return (
    <main className="flex flex-col h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="bg-neutral-700 text-white shadow-md px-6 py-4 text-xl font-bold border-b border-gray-200">
        Unity Scene AI
      </header>

      {showSketchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded shadow-lg w-[850px] max-w-full">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span>🖋️</span> Sketch Store Layout
            </h3>

            {/* Sketch Canvas */}
            <SketchCanvas ref={sketchCanvasRef} />

            {/* Footer Buttons */}
            <div className="mt-4 flex justify-between items-center">
              {/* Left: Cancel */}
              <button
                onClick={() => setShowSketchModal(false)}
                className="px-4 py-2 bg-red-500 text-white rounded"
              >
                Cancel
              </button>

              {/* Right: Clear + Analyze */}
              <div className="space-x-2">
                <button
                  onClick={() => sketchCanvasRef.current?.clearCanvas()}
                  className="px-4 py-2 bg-gray-600 text-white rounded"
                >
                  Clear
                </button>
                <button
                  onClick={() => {
                    const base64 = sketchCanvasRef.current?.getBase64();
                    if (base64) {
                      setShowSketchModal(false);
                      handleUpload(base64);
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded"
                >
                  Analyze
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Upload Controls */}
      <div className="flex items-center gap-4 px-6 py-4 bg-gray-300 border-b border-gray-200">
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => setFileList(Array.from(e.target.files || []))}
          className="file:mr-4 file:px-4 file:py-2 file:rounded file:border-0 file:bg-gray-600 file:text-white hover:file:bg-gray-700 file:cursor-pointer"
        />
        <button
          onClick={handleUpload}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition"
        >
          Upload & Analyze
        </button>

        <button
          onClick={() => setShowSketchModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
        >
          Draw
        </button>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Scene and Controls */}
        <div className="w-2/3 p-6 overflow-auto border-r border-gray-200 bg-white">
          <div className="w-full h-120 mt-4 border border-gray-300 rounded">
            <SceneCanvas
              sceneData={sceneData}
              selectedIndex={selectedIndex}
              onSelect={(index) => setSelectedIndex(index)}
            />
          </div>

          <div className="mt-5">
            <select
              value={selectedIndex}
              onChange={(e) => setSelectedIndex(Number(e.target.value))}
              className="mb-4 border rounded px-2 py-1"
            >
              {sceneData.map((obj, index) => (
                <option key={index} value={index}>
                  {obj.type} {index}
                </option>
              ))}
            </select>

            <button
              onClick={resetObject}
              className="px-2 py-2 ml-2 rounded cursor-pointer hover:text-red-700"
            >
            Reset Object
            </button>

            {/* Controls */}
            <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-1">Move / Rotate</h4>
              <div className="flex flex-wrap gap-4">
                {/* Move Controls */}
                <div className="flex gap-2 flex-wrap">
                  <ControlBtn label="← X-" onClick={() => moveObject(0, -0.5)} />
                  <ControlBtn label="→ X+" onClick={() => moveObject(0, 0.5)} />
                  <ControlBtn label="↑ Y+" onClick={() => moveObject(1, 0.5)} />
                  <ControlBtn label="↓ Y-" onClick={() => moveObject(1, -0.5)} />
                  <ControlBtn label="⬆ Z+" onClick={() => moveObject(2, 0.5)} />
                  <ControlBtn label="⬇ Z-" onClick={() => moveObject(2, -0.5)} />
                </div>

                {/* Rotate Controls */}
                <div className="flex gap-2 flex-wrap">
                  <ControlBtn label="⤴ X+" onClick={() => rotateObject(0, Math.PI / 8)} />
                  <ControlBtn label="⤵ X-" onClick={() => rotateObject(0, -Math.PI / 8)} />
                  <ControlBtn label="🔁 Y+" onClick={() => rotateObject(1, Math.PI / 8)} />
                  <ControlBtn label="🔂 Y-" onClick={() => rotateObject(1, -Math.PI / 8)} />
                  <ControlBtn label="↩ Z+" onClick={() => rotateObject(2, Math.PI / 8)} />
                  <ControlBtn label="↪ Z-" onClick={() => rotateObject(2, -Math.PI / 8)} />
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-1">Scale</h4>
              <div className="flex gap-2 flex-wrap items-center">
                <ControlBtn label="+ All" onClick={() => scaleObject(1.2)} />
                <ControlBtn label="- All" onClick={() => scaleObject(0.8)} />
                <ControlBtn label="↕️ Taller" onClick={() => scaleAxis(1, 1.2)} />
                <ControlBtn label="↕️ Shorter" onClick={() => scaleAxis(1, 0.8)} />
                <ControlBtn label="↔️ Wider" onClick={() => scaleAxis(0, 1.2)} />
                <ControlBtn label="↔️ Thinner" onClick={() => scaleAxis(0, 0.8)} />
              </div>
            </div>

              <button
                onClick={handleSaveScene}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
              >
                💾 Save Scene
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel: Chatbot */}
        <div className="w-1/3 p-6 flex flex-col bg-gray-100">
          <div className="flex-1 overflow-y-auto border rounded p-4 bg-white mb-4">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`mb-4 p-3 rounded ${
                  msg.role === "user" ? "bg-blue-50 text-gray-900" : "bg-green-50 text-gray-800"
                }`}
              >
                <p className="font-semibold">
                  {msg.role === "user" ? "🧑 You" : "🤖 Assistant"}:
                </p>
                <p className="mt-1 whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type your question..."
              className="flex-1 px-4 py-2 border rounded text-gray-900 placeholder-gray-500"
            />
            <button
              onClick={handleSendMessage}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

// Reusable button for controls
function ControlBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 bg-gray-700 text-white rounded text-sm hover:bg-gray-800"
    >
      {label}
    </button>
  );
}

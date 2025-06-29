"use client";
import { useRef, useEffect, useState } from "react";
import SceneCanvas from "@/app/ui/SceneCanvas";
import * as THREE from "three";
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';


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

 const handleUpload = async () => {
  if (fileList.length === 0) return;

  addChatMessage({ role: "assistant", content: "🧠 Analyzing your images...Please wait!" });
  setAnalysisResponse("🧠 Reading images...");

  const base64Images = await Promise.all(
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
              
              Your job is to reconstruct the basic structure of the store as a 3D scene in JSON format.
              
              ---
              
              🎯 TASK:
              
              Return a **pure JSON array** of 3D objects with the following format:
              
              1. A single floor object:
                - type: "box"
                - position: [0, 0, 0]
                - scale: [width, 0.1, depth] (in meters)
                - color: "lightgray"
                - log: "...summary of what you detected..."
              
              2. One or more wall objects:
                - type: "box"
                - position: [x, y, z]
                - scale: [x, y, z]
                - rotation: [x, y, z]
                - color: "white"
                - material (optional): "reflective"
              
              ---
              
              🎨 MATERIAL RULES:
              
              - **Walls must be white and reflective**.
                - Use "color": "white" for all wall objects.
                - Optionally add "material": "reflective" to indicate a glossy, light-reflecting surface.
                - Example:
                  {
                    "type": "box",
                    "position": [-5, 1.25, 0],
                    "scale": [0.2, 2.5, 8],
                    "color": "white",
                    "material": "reflective"
                  }
              
              - **Floor should not be reflective**.
                - Use "color": "lightgray" and no "material" field for the floor.
              
              ---

              🧱 FLOOR MATERIAL:

              - The floor should simulate tiled indoor flooring.
              - Always set: "texturePath": "/Tiles.png" on the floor object.
              - The floor color should still be "lightgray" as a fallback.
              - This texture will be tiled across the floor to simulate real tiles.

              Example floor object:
              {
                "type": "box",
                "position": [0, 0, 0],
                "scale": [10, 0.1, 8],
                "color": "lightgray",
                "texturePath": "/Tiles.png",
                "log": "..."
              }

              ---
              
              📐 GEOMETRY RULES:
              
              - Floor must always be centered at [0, 0, 0]
              - Wall height: typically 2.5 meters
              - Wall thickness: ~0.2 meters
              - Position each wall so that it sits perfectly on the floor:
                - Y = scale.y / 2
              - Do not create floating, overlapping, or misaligned geometry
              - Units are in meters
              
              ---
              
              🧠 INTELLIGENT STRUCTURE DETECTION:
              
              From the images, determine:
              - Estimated size of the store
              - Where structural walls are located
              - Whether the front is open, glass, door, etc.
              
              Do **not** hardcode any assumptions (like "always 3 walls").
              Use visual reasoning and layout clues to decide how many walls and where they should be.
              
              ---

              🧰 COMMON STORE OBJECTS:

             It must have a shelving, if you can not detect the position, just estimate the position and rotation, add model objects using:

              {
                "type": "model",
                "path": "/models/shelving.glb",
                "position": [x, y, z],
                "rotation": [0, Y-degrees, 0],
                "scale": [1, 1, 1]
              }

              - Place shelves along walls or between aisles
              - Ensure shelves are placed on the floor: Y-position = height / 2
              - Use rotation Y-axis to face correct direction

              ---
              
              📄 OUTPUT FORMAT:
              
              - Return **only a JSON array** (no markdown, no extra text)
              - Must include:
                - 1 floor object (first)
                - N wall objects
              - All objects: must have type, position, scale, color
              - Wall objects: should also include "material": "reflective"
              
              Example:
              [
                {
                  "type": "box",
                  "position": [0, 0, 0],
                  "scale": [10, 0.1, 8],
                  "color": "lightgray",
                  "log": "2 images analyzed. Estimated floor: 10m x 8m. Glass entrance at front. Walls on left, right, back."
                },
                {
                  "type": "box",
                  "position": [-5, 1.25, 0],
                  "scale": [0.2, 2.5, 8],
                  "color": "white",
                  "material": "reflective"
                }
              ]
---

🎨 NOTES:

- Use visual clues like corners, shadows, shelving alignment, and doors
- You may use estimation if layout is missing
- Avoid floating walls or disconnected elements

---

Respond with a pure JSON array. No extra text or markdown.`,
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
    let resultText = data?.result || "";
    resultText = resultText.replace(/```json|```/g, "").trim();
    const sceneObjects = JSON.parse(resultText);

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

  const addChatMessage = (msg: { role: string; content: string }) => {
    setChatMessages((prev) => {
      const updated = [...prev, msg];
      return updated;
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
    //console.log("Sending messages to AI:", updatedMessages);
  
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

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: payloadMessages, sceneData, }),
    });

    const data = await res.json();
    const assistantReply = data?.result || "No response";

    let updatedScene: SceneItem[] | null = null;

     try {
    const parsed = JSON.parse(assistantReply);
      if (Array.isArray(parsed)) {
        updatedScene = parsed;

        const corrected = await fixFloatingModels(parsed);

        setSceneData(corrected); 

        const floor = corrected[0];
        if (floor?.message) {
          addChatMessage({ role: "assistant", content: floor.message });
        } else {
          addChatMessage({ role: "assistant", content: "✅ Scene updated." });
        }
      } else {
        // fallback if it's not a JSON array
        addChatMessage({ role: "assistant", content: assistantReply });
      }
    } catch (e) {
      // not JSON, just treat as a normal message
      addChatMessage({ role: "assistant", content: assistantReply });
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

  return (
    <main className="flex flex-col h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="bg-neutral-700 text-white shadow-md px-6 py-4 text-xl font-bold border-b border-gray-200">
        Unity Scene AI
      </header>

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

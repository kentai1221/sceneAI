"use client";
import { useEffect, useState } from "react";
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
};

export default function Home() {
  const [fileList, setFileList] = useState<File[]>([]);
  const [analysisResponse, setAnalysisResponse] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sceneData, setSceneData] = useState<SceneItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    fetch("/scene.json")
      .then((res) => res.json())
      .then((data) => setSceneData(data));
  }, []);

  const handleUpload = async () => {
    if (fileList.length === 0) return;
  
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
      // Step 1: Generate floor
      setAnalysisResponse("🧠 Generating floor...");
  
      const imageParts = base64Images.map((base64) => ({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${base64}` },
      }));
      const [actualWidth, actualHeight, actualDepth] = await getActualSizeFromGLB("/models/floor.glb");

      const floorPrompt = {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You're generating a 3D layout for a 7-11 store.

                The original floor model has these real dimensions:
                - Width: ${actualWidth.toFixed(2)} meters
                - Depth: ${actualDepth.toFixed(2)} meters

                Based on the store in the image, estimate the correct size **in meters** that the floor should be scaled to match:
                - Desired Width: ?
                - Desired Depth: ?

                Return only one object in this format:
                {
                  "type": "model",
                  "path": "/models/floor.glb",
                  "targetSize": [desiredWidthInMeters, desiredHeight, desiredDepthInMeters]
                }

                Note:
                - Do not return a scale.
                - Use meters.
                - Height can be fixed (e.g. 0.1).
                - Return JSON array only.`
                  },
                  ...imageParts,
                ],
              },
            ],
      };
      
  
      const floorRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePayload: floorPrompt }),
      });
  
      const floorData = await floorRes.json();
      let floorText = floorData?.result || "";
      floorText = floorText.replace(/```json|```/g, "").trim();
      const floorJSON = JSON.parse(floorText);

      const floor = Array.isArray(floorJSON) ? floorJSON[0] : floorJSON;
      const targetSize = floor.targetSize;
      const finalScale = [
        targetSize[0] / actualWidth,
        targetSize[1] / actualHeight,
        targetSize[2] / actualDepth
      ];
      
      const scaledFloor = {
        type: "model",
        path: "/models/floor.glb",
        scale: finalScale
      };
      // Step 2: Generate walls
      setAnalysisResponse("🧱 Generating walls...");
      const [floorWidth, floorHeight, floorDepth] = scaledFloor.scale;

      const wallPrompt = {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You're generating 4 surrounding walls for a 7-11 store floor.
      
      The floor object is:
      ${JSON.stringify(scaledFloor, null, 2)}
      
      Rules for each wall:
      - type: "box"
      - color: "lightgray"
      - height: 2.5 meters
      - thickness: 0.2 meters
      
      Placement:
      - Front/Back walls:
        - scale: [${floorWidth}, 2.5, 0.2]
        - position.z: ±(${floorDepth} / 2 + 0.1)
        - position.y: 1.25 (half the wall height)
      - Left/Right walls:
        - scale: [0.2, 2.5, ${floorDepth}]
        - position.x: ±(${floorWidth} / 2 + 0.1)
        - position.y: 1.25
      
      Format:
      - Use arrays only for scale and position (e.g. [x, y, z])
      - Do NOT use object format
      - Return a JSON array with 4 walls, no markdown, no comments.`
              }
            ]
          }
        ]
      };
      
      const wallRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePayload: wallPrompt }),
      });
  
      const wallData = await wallRes.json();
      let wallText = wallData?.result || "";
      wallText = wallText.replace(/```json|```/g, "").trim();
      const walls = JSON.parse(wallText);

  
      // Combine and show
      setSceneData([scaledFloor, ...walls]);
      console.log([scaledFloor, ...walls])
      setAnalysisResponse("✅ Floor and walls loaded!");
    } catch (err) {
      console.error("Upload error:", err);
      setAnalysisResponse("❌ Failed to load scene.");
    }
  };
  

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const updatedMessages = [...chatMessages, { role: "user", content: chatInput }];
    setChatMessages(updatedMessages);
    setChatInput("");

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: updatedMessages }),
    });

    const data = await res.json();
    setChatMessages([...updatedMessages, { role: "assistant", content: data?.result || "No response" }]);
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

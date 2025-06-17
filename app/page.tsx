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
              text: `You are analyzing one or more images of a 7-Eleven store.

Some images may be real-world photos of the store interior.
Some may be layout sketches or top-down floorplans.
Some may contain both types of information.

Instructions:

If a layout or sketch is available, use it to determine the structure and layout of the store (walls, floor area).

If only real photos are available, use them to estimate the store's approximate size and proportions.

If both are available, use the layout for structure and the photos for real-world scale.

Layout should be used to determine the floor area and wall positions if both types of images are present.

Your task is to return a single JSON array including:

1 floor object (type: "box", color: "lightgray")

N wall objects (type: "box", color: "gray") based on what is visible in the layout or images

Wall Generation Rules:

The store layout should include 3 full walls (left, right, and back).

The front side (customer-facing) must NOT have a full wall.

Instead, do one of the following:

Leave it fully open (no wall at all)

OR add two short wall segments (e.g., 1 meter wide) on each side of the front opening

This is typical of Hong Kong 7-Eleven stores: glass or shelf areas at the front

DO NOT generate walls that are floating or disconnected from the floor

All wall elements must connect precisely with the floor and align correctly with the layout

Wall height: 2.5 meters

Wall thickness: 0.2 meters

You must compute the correct width/depth of each wall based on the floor and detected layout

Floor Object Requirements:

The first object in the array must be the floor

type: "box"

color: "lightgray"

position: [0, 0, 0]

scale: [width, 0.1, depth] (in meters)

Include a log field in the floor object with the following format:
log: "n layout, n photos, Xm x Ym, objects: object_name_1 at [x,y,z], rotation: [x,y,z], object_name_2 at [x,y,z], rotation: [x,y,z]..."

Rotation Notes:

Use degrees for rotations

Focus on Y-axis (facing direction)

Final Output Requirements:

Return only a pure JSON array

Format: 1 floor + N wall objects

No markdown, no extra text`,
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


  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const updatedMessages = [...chatMessages, { role: "user", content: chatInput }];
    setChatMessages(updatedMessages);
    setChatInput("");
    //console.log("Sending messages to AI:", updatedMessages);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: updatedMessages, sceneData, }),
    });

    const data = await res.json();
    const assistantReply = data?.result || "No response";

    let updatedScene: SceneItem[] | null = null;

     try {
    const parsed = JSON.parse(assistantReply);
      if (Array.isArray(parsed)) {
        updatedScene = parsed;
        setSceneData(parsed); 

        const floor = parsed.find((obj) => obj.type === "box" && obj.position?.[1] === 0);
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

"use client";
import { useEffect, useState } from "react";
import SceneCanvas from "@/app/ui/SceneCanvas";

type SceneItem = {
  type: "box" | "model";
  path?: string; // for models
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color?: string; // for boxes
};


export default function Home() {
  const [file, setFile] = useState<File | null>(null);
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
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result?.toString().split(",")[1];
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 }),
      });
      const data = await res.json();
      setAnalysisResponse(data?.result || "No response");
    };
    reader.readAsDataURL(file);
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
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="file:mr-4 file:px-4 file:py-2 file:rounded file:border-0 file:bg-gray-600 file:text-white hover:file:bg-gray-700 file:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleUpload}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Upload & Analyze
        </button>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Analysis Result */}
        <div className="w-2/3 p-6 overflow-auto border-r border-gray-200 bg-white">
          <h2 className="font-semibold text-lg mb-2">Image Analysis Result</h2>
          {/* <pre className="bg-gray-100 p-4 rounded text-gray-800 whitespace-pre-wrap">
            {analysisResponse}
          </pre> */}
          <div className="w-full h-120 mt-4 border border-gray-300 rounded">
            <SceneCanvas 
              sceneData={sceneData}
              selectedIndex={selectedIndex}
              onSelect={(index) => setSelectedIndex(index)} 
            />
          </div>
          <div className="mt-6">
            <h3 className="text-md font-medium mb-2">Edit Object</h3>

            {/* Object Selector */}
            <select
              value={selectedIndex}
              onChange={(e) => setSelectedIndex(Number(e.target.value))}
              className="mb-2 border rounded px-2 py-1"
            >
              {sceneData.map((obj, index) => (
                <option key={index} value={index}>
                  {obj.type} {index}
                </option>
              ))}
            </select>

            {/* Controls */}
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setSceneData((prev) => {
                    const updated = [...prev];
                    if (updated[selectedIndex] && updated[selectedIndex].position) {
                      const [x, y, z] = updated[selectedIndex].position!;
                      updated[selectedIndex] = {
                        ...updated[selectedIndex],
                        position: [x + 1, y, z],
                      };
                    }
                    return updated;
                  })
                }
                className="px-3 py-1 bg-gray-700 text-white rounded"
              >
                ➡️ Move X
              </button>

              <button
                onClick={() =>
                  setSceneData((prev) => {
                    const updated = [...prev];
                    if (updated[selectedIndex] && updated[selectedIndex].position) {
                      const [x, y, z] = updated[selectedIndex].position!;
                      updated[selectedIndex] = {
                        ...updated[selectedIndex],
                        position: [x, y + 1, z],
                      };
                    }
                    return updated;
                  })
                }
                className="px-3 py-1 bg-gray-700 text-white rounded"
              >
                ⬆️ Move Y
              </button>

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
                  msg.role === "user"
                    ? "bg-blue-50 text-gray-900"
                    : "bg-green-50 text-gray-800"
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
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

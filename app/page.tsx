"use client";
import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [analysisResponse, setAnalysisResponse] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");

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
          <pre className="bg-gray-100 p-4 rounded text-gray-800 whitespace-pre-wrap">
            {analysisResponse}
          </pre>
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

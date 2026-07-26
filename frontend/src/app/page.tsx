"use client";

import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface DocItem {
  filename: string;
  chunks: number;
}

export default function SynapseAgentDashboard() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Welcome to **Synapse AI**. The node cluster is active and synchronized with your Pinecone indices. Upload a PDF or select a suggested prompt to begin.",
    },
  ]);
  const [inputQuery, setInputQuery] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Document Inventory State
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      if (res.ok && data.documents) {
        setDocuments(data.documents);
      }
    } catch (e) {
      console.error("Failed to load documents", e);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setIsUploading(true);
    setUploadStatus({ type: null, message: "" });
    const formData = new FormData();
    formData.append("file", selectedFile);
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        setUploadStatus({
          type: "success",
          message: data.message || "Injected into Pinecone Cloud!",
        });
        setSelectedFile(null);
        fetchDocuments();
      } else {
        setUploadStatus({
          type: "error",
          message: data.detail || "Failed to process document.",
        });
      }
    } catch (error) {
      setUploadStatus({ type: "error", message: "Backend connection lost." });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (filename: string) => {
    setIsDeleting(filename);
    try {
      const res = await fetch("/api/documents/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      if (res.ok) {
        fetchDocuments();
      }
    } catch (e) {
      console.error("Delete failed", e);
    } finally {
      setIsDeleting(null);
    }
  };

  const handleSendChat = async (prompt?: string) => {
    const queryToSend = prompt || inputQuery;
    if (!queryToSend.trim() || isChatLoading) return;

    const userMessage: Message = { role: "user", content: queryToSend };
    setMessages((prev) => [...prev, userMessage]);
    setInputQuery("");
    setIsChatLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Stream connection failed.");
      }

      // Add placeholder assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedReply = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                accumulatedReply += data.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: accumulatedReply,
                  };
                  return updated;
                });
              }
            } catch (err) {
              // Ignore partial JSON chunks
            }
          }
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Error: Lost backend server connectivity connection.",
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const suggestedPrompts = [
    "Summarize the main operational insights",
    "List all technical requirements and risks",
    "Extract key metrics and figures",
  ];

  return (
    <div className="flex min-h-screen bg-[#f8fafc] text-[#0f172a] font-sans antialiased overflow-x-hidden selection:bg-[#b9b9f9]">
      <style jsx global>{`
        html,
        body {
          font-feature-settings:
            "ss01" on,
            "cv10" on;
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
        }
        .tabular-money {
          font-feature-settings: "tnum" on;
        }
      `}</style>

      {/* BACKGROUND AMBIENT GRADIENT */}
      <div className="fixed top-0 left-64 w-[calc(100vw-16rem)] h-[35vh] bg-gradient-to-r from-[#f5e9d4]/40 via-[#f96bee]/20 to-[#533afd]/20 opacity-40 blur-[120px] pointer-events-none z-0" />

      {/* LEFT SIDEBAR CHROME */}
      <aside className="w-64 bg-[#0b192c] text-white flex flex-col border-r border-[#1e293b] fixed top-0 bottom-0 left-0 z-20 shadow-2xl">
        <div className="p-5 border-b border-[#1e293b] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-3.5 h-3.5 rounded-md bg-gradient-to-tr from-[#533afd] to-[#f96bee] shadow-[0_0_10px_#533afd]" />
            <span className="font-semibold text-[16px] tracking-tight text-white">
              Synapse <span className="text-[#6366f1] font-light">AI</span>
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-[#1e293b] text-[#94a3b8] text-[10px] font-medium border border-[#334155]">
            v1.4
          </span>
        </div>

        <nav className="flex-1 p-3.5 space-y-1.5 pt-5 overflow-y-auto">
          <span className="px-2.5 text-[10px] uppercase font-semibold tracking-wider text-[#64748b] block mb-2">
            Workspace
          </span>

          <button className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-[13px] bg-[#1e293b] text-white font-medium text-left shadow-sm border border-[#334155]/40">
            <svg
              className="w-4 h-4 text-[#6366f1]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <span>Agent Console</span>
          </button>

          {/* ACTIVE DOCUMENTS SIDEBAR INVENTORY */}
          <div className="pt-5">
            <div className="flex items-center justify-between px-2.5 mb-2">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-[#64748b]">
                Cloud Inventory
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#1e293b] text-[#a5b4fc] text-[10px] tabular-money font-semibold border border-[#334155]">
                {documents.length} Files
              </span>
            </div>

            <div className="space-y-1.5">
              <AnimatePresence>
                {documents.map((doc, idx) => (
                  <motion.div
                    key={doc.filename || idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="flex items-center justify-between bg-[#1e293b]/50 hover:bg-[#1e293b] border border-[#334155]/50 rounded-lg p-2 text-[12px] group transition-all"
                  >
                    <div className="truncate mr-2 flex items-center space-x-2">
                      <svg
                        className="w-3.5 h-3.5 text-[#94a3b8] shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <div className="truncate">
                        <p className="text-white font-medium truncate text-[11px]">
                          {doc.filename}
                        </p>
                        <span className="text-[#64748b] text-[9px] tabular-money">
                          {doc.chunks} chunks
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteDocument(doc.filename)}
                      disabled={isDeleting === doc.filename}
                      className="opacity-0 group-hover:opacity-100 bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white px-2 py-0.5 rounded transition-all text-[9px]"
                    >
                      {isDeleting === doc.filename ? "..." : "Purge"}
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>

              {documents.length === 0 && (
                <div className="p-3 border border-dashed border-[#1e293b] rounded-lg text-center">
                  <p className="text-[11px] text-[#64748b] font-light">
                    No files synced yet.
                  </p>
                </div>
              )}
            </div>
          </div>
        </nav>

        {/* UPLOAD DECK */}
        <div className="p-3.5 border-t border-[#1e293b] bg-[#071322]">
          <span className="text-[10px] tracking-wider uppercase font-semibold text-[#64748b] block mb-2 px-1">
            Synchronization
          </span>
          <form onSubmit={handleFileUpload} className="space-y-2.5">
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border border-dashed rounded-lg p-3 text-center cursor-pointer transition-all ${
                selectedFile
                  ? "border-[#6366f1] bg-[#1e293b]"
                  : "border-[#334155] hover:border-[#6366f1] bg-[#1e293b]/30"
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                accept=".pdf"
                className="hidden"
              />
              <svg
                className="w-4 h-4 text-[#94a3b8] mx-auto mb-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-[11px] text-[#a5b4fc] font-light break-all">
                {selectedFile ? (
                  <span className="font-medium text-[#818cf8]">
                    {selectedFile.name}
                  </span>
                ) : (
                  "Click to select PDF"
                )}
              </p>
            </div>
            {selectedFile && (
              <button
                type="submit"
                disabled={isUploading}
                className="w-full bg-[#533afd] hover:bg-[#4338ca] text-white font-medium text-[12px] h-8 rounded-md shadow-md transition-all"
              >
                {isUploading ? "Syncing..." : "Commit Vectors"}
              </button>
            )}
          </form>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="ml-64 flex-1 min-h-screen flex flex-col relative z-10">
        <div className="p-8 max-w-6xl w-full mx-auto space-y-6 flex-1 flex flex-col">
          {/* HEADER BAR */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[24px] font-light tracking-tight text-[#0f172a]">
                Agent Infrastructure
              </h1>
              <p className="text-[12px] text-[#64748b] font-light">
                Cloud Vector Store & Agentic Retrieval
              </p>
            </div>
            <div className="flex items-center space-x-2 bg-white border border-[#e2e8f0] px-3.5 py-1.5 rounded-full shadow-2xs text-[12px]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[#0f172a] font-medium">Cluster Active</span>
            </div>
          </div>

          {/* METRIC CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                label: "Index State",
                val: "Active Cloud",
                icon: "M3 15a4 4 0 004 4h9a5 5 0 001.09-9.88A5.5 5.5 0 005.077 10.5 6 6 0 003 15z",
                color: "text-[#0f172a]",
              },
              {
                label: "Compute Engine",
                val: "Groq Llama 3.1",
                icon: "M13 10V3L4 14h7v7l9-11h-7z",
                color: "text-[#533afd]",
              },
              {
                label: "Synced Documents",
                val: `${documents.length} Files`,
                icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
                color: "text-[#0f172a]",
              },
            ].map((metric, i) => (
              <div
                key={i}
                className="bg-white border border-[#e2e8f0] rounded-xl p-4 shadow-2xs flex items-center justify-between"
              >
                <div>
                  <span className="text-[10px] tracking-wider uppercase font-semibold text-[#64748b] block mb-0.5">
                    {metric.label}
                  </span>
                  <div className={`text-[17px] font-light ${metric.color}`}>
                    {metric.val}
                  </div>
                </div>
                <div className="w-9 h-9 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-center text-[#533afd]">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d={metric.icon}
                    />
                  </svg>
                </div>
              </div>
            ))}
          </div>

          {/* CHAT MONITOR CONSOLE */}
          <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-sm overflow-hidden flex flex-col flex-1 min-h-[500px]">
            <div className="bg-[#0b192c] px-5 py-3 flex items-center justify-between border-b border-[#1e293b]">
              <div className="flex items-center space-x-2.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <div>
                  <h3 className="text-white text-[13px] font-normal tracking-tight">
                    Active Stream
                  </h3>
                  <p className="text-[#64748b] text-[10px] font-light">
                    llama-3.1-8b-instant
                  </p>
                </div>
              </div>
              <span className="text-[#94a3b8] text-[10px] font-mono bg-[#1e293b] px-2 py-0.5 rounded border border-[#334155]">
                3,072 Dims
              </span>
            </div>

            {/* MESSAGE CHAT FEED */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#f8fafc]">
              <AnimatePresence initial={false}>
                {messages.map((msg, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 150,
                      damping: 18,
                    }}
                    className={`flex items-start space-x-3 ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-lg bg-[#533afd] text-white flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5 shadow-2xs">
                        AI
                      </div>
                    )}

                    <div
                      className={`group relative max-w-[82%] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed shadow-2xs border ${
                        msg.role === "user"
                          ? "bg-[#533afd] text-white border-[#4338ca] rounded-tr-xs font-light"
                          : "bg-white text-[#0f172a] border-[#e2e8f0] rounded-tl-xs"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <div>
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => (
                                <p className="mb-2 last:mb-0 font-light">
                                  {children}
                                </p>
                              ),
                              strong: ({ children }) => (
                                <strong className="font-semibold text-[#0f172a]">
                                  {children}
                                </strong>
                              ),
                              ul: ({ children }) => (
                                <ul className="list-disc pl-4 mb-2 space-y-1 font-light">
                                  {children}
                                </ul>
                              ),
                              li: ({ children }) => (
                                <li className="font-light">{children}</li>
                              ),
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>

                          <button
                            onClick={() => copyToClipboard(msg.content, index)}
                            className="mt-2 text-[11px] text-[#64748b] hover:text-[#533afd] flex items-center space-x-1 transition-colors"
                          >
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                            <span>
                              {copiedIndex === index
                                ? "Copied!"
                                : "Copy response"}
                            </span>
                          </button>
                        </div>
                      ) : (
                        <span className="whitespace-pre-wrap">
                          {msg.content}
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {isChatLoading && (
                <div className="flex justify-start space-x-3 items-center">
                  <div className="w-7 h-7 rounded-lg bg-[#533afd] text-white flex items-center justify-center text-[10px] font-semibold">
                    AI
                  </div>
                  <div className="bg-white text-[#64748b] border border-[#e2e8f0] rounded-2xl rounded-tl-xs px-4 py-2.5 text-[13px] font-light shadow-2xs flex items-center space-x-2">
                    <span className="font-medium animate-pulse text-[#533afd]">
                      LangGraph agent is reasoning
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* SUGGESTED PROMPT CHIPS */}
            {messages.length <= 1 && (
              <div className="px-5 py-2 bg-white border-t border-[#e2e8f0] flex items-center space-x-2 overflow-x-auto">
                <span className="text-[11px] text-[#64748b] font-light shrink-0">
                  Try asking:
                </span>
                {suggestedPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendChat(prompt)}
                    className="text-[11.5px] bg-[#f8fafc] border border-[#e2e8f0] hover:border-[#533afd] text-[#0f172a] hover:text-[#533afd] px-3 py-1 rounded-full whitespace-nowrap transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {/* INPUT BAR TERMINAL */}
            <div className="p-3.5 bg-white border-t border-[#e2e8f0]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendChat();
                }}
                className="flex items-center space-x-3"
              >
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    placeholder="Compare operational metrics or search vectors..."
                    className="w-full bg-[#f8fafc] text-[#0f172a] placeholder-[#94a3b8] border border-[#cbd5e1] focus:border-[#533afd] focus:bg-white rounded-lg h-10 pl-4 pr-10 text-[13.5px] font-light outline-none transition-all"
                  />
                  <span className="absolute right-3 top-2.5 text-[10px] text-[#94a3b8] border border-[#cbd5e1] px-1.5 py-0.5 rounded font-mono">
                    ↵
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={isChatLoading || !inputQuery.trim()}
                  className="bg-[#0b192c] hover:bg-[#1e293b] text-white font-medium text-[13.5px] h-10 px-5 rounded-lg shadow-2xs whitespace-nowrap transition-all disabled:opacity-40"
                >
                  Query Agent
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
# ⚡ Synapse AI — Enterprise Agentic RAG Knowledge Engine

**Synapse AI** is a production-grade, asynchronous Agentic Retrieval-Augmented Generation (RAG) system built to parse, index, and query enterprise documents with multi-hop reasoning, live token streaming, and cited vector search.

---

## 🌟 Key Features

* **Autonomous Multi-Agent Routing:** Built on **LangGraph** state machines with conditional tool-calling and self-correction.
* **Serverless Vector Architecture:** Leverages **Pinecone Serverless** for high-dimensional embedding storage (3,072 dimensions) with metadata-based document scoping.
* **High-Velocity Inference:** Powered by **Groq Llama 3.1 (8B)** for ultra-low latency LLM generation.
* **Persistent Document Registry:** Features real-time PDF chunking, cloud inventory tracking, and targeted document purging.
* **Modern Executive Dashboard:** Designed with Next.js 14, Tailwind CSS, React Markdown, and fluid **Framer Motion** spring physics.

---

## 🛠️ Tech Stack

* **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion, React Markdown
* **Backend:** FastAPI, Python 3.11, Uvicorn, Asynchronous SSE Streaming
* **Orchestration:** LangGraph, LangChain
* **Vector Store:** Pinecone Cloud Vector Database
* **Models:** Groq Llama 3.1 8B Instant (Chat Engine), Google Gemini Embedding 2 (Dense Embeddings)

---

## 🚀 Getting Started Locally

### 1. Prerequisites
Ensure you have Python 3.10+, Node.js 18+, and your API keys for Groq, Google AI Studio, and Pinecone.

### 2. Backend Setup
```bash
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload

#Front End Setup 
cd frontend
npm install
npm run dev
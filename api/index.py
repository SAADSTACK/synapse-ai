import os
import io
import json
from typing import Annotated, Literal, TypedDict
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from langchain_core.documents import Document
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from pypdf import PdfReader

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# HELPER INITIALIZERS (Lazy load to prevent top-level import crashes)
def get_llm():
    from langchain_groq import ChatGroq
    key = os.getenv("GROQ_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY environment variable is missing on Vercel.")
    return ChatGroq(model="llama-3.1-8b-instant", temperature=0, groq_api_key=key)

def get_vector_store():
    from langchain_google_genai import GoogleGenerativeAIEmbeddings
    from langchain_pinecone import PineconeVectorStore

    g_key = os.getenv("GOOGLE_API_KEY")
    p_key = os.getenv("PINECONE_API_KEY")
    idx_name = os.getenv("PINECONE_INDEX_NAME", "agentic-knowledge-base")

    if not g_key or not p_key:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY or PINECONE_API_KEY missing on Vercel.")

    embeddings = GoogleGenerativeAIEmbeddings(
        model="gemini-embedding-2-preview",
        task_type="RETRIEVAL_DOCUMENT",
        google_api_key=g_key
    )
    return PineconeVectorStore(index_name=idx_name, embedding=embeddings)

REGISTRY_FILE = "/tmp/documents_registry.json" if os.getenv("VERCEL") else "documents_registry.json"

def load_registry():
    if os.path.exists(REGISTRY_FILE):
        try:
            with open(REGISTRY_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_registry(registry):
    try:
        with open(REGISTRY_FILE, "w") as f:
            json.dump(registry, f, indent=2)
    except Exception:
        pass

# TOOLS & AGENT LOGIC
@tool
def query_knowledge_base(search_query: str) -> str:
    """Queries the Pinecone cloud database to fetch relevant text blocks."""
    try:
        v_store = get_vector_store()
        docs = v_store.similarity_search(search_query, k=4)
        if not docs:
            return "No matching records found inside the cloud document collection."
        
        formatted = []
        for d in docs:
            src = d.metadata.get("source", "Unknown Document")
            formatted.append(f"[Source: {src}]\nContext:\n{d.page_content}")
        return "\n\n---\n\n".join(formatted)
    except Exception as e:
        return f"Cloud database query error: {str(e)}"

tools_map = {"query_knowledge_base": query_knowledge_base}

class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]

def call_model_node(state: AgentState):
    llm = get_llm().bind_tools([query_knowledge_base])
    system_instruction = SystemMessage(
        content="You are an advanced Agentic Knowledge Assistant with access to a cloud knowledge base. "
                "Always support your final answers with direct citations including the source filename."
    )
    response = llm.invoke([system_instruction] + state["messages"])
    return {"messages": [response]}

def execute_tools_node(state: AgentState):
    last_msg = state["messages"][-1]
    tool_outputs = []
    for tool_call in last_msg.tool_calls:
        tool_func = tools_map[tool_call["name"]]
        output = tool_func.invoke(tool_call["args"])
        tool_outputs.append(ToolMessage(content=str(output), name=tool_call["name"], tool_call_id=tool_call["id"]))
    return {"messages": tool_outputs}

def should_continue(state: AgentState) -> Literal["tools", "end"]:
    last_msg = state["messages"][-1]
    if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
        return "tools"
    return "end"

workflow = StateGraph(AgentState)
workflow.add_node("llm_agent", call_model_node)
workflow.add_node("tools", execute_tools_node)
workflow.set_entry_point("llm_agent")
workflow.add_conditional_edges("llm_agent", should_continue, {"tools": "tools", "end": END})
workflow.add_edge("tools", "llm_agent")

agent_brain = workflow.compile(checkpointer=MemorySaver())

# ROUTES
class ChatPayload(BaseModel):
    message: str
    thread_id: str = "default_session"

@app.post("/api/chat")
@app.post("/chat")
async def process_agent_chat(payload: ChatPayload):
    config = {"configurable": {"thread_id": payload.thread_id}}

    async def generate_tokens():
        try:
            async for event in agent_brain.astream_events(
                {"messages": [HumanMessage(content=payload.message)]},
                config=config,
                version="v2"
            ):
                if event["event"] == "on_chat_model_stream":
                    chunk = event["data"]["chunk"]
                    if hasattr(chunk, "content") and chunk.content:
                        yield f"data: {json.dumps({'content': chunk.content})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'content': f'\n\n**Error:** `{str(e)}`'})}\n\n"

    return StreamingResponse(generate_tokens(), media_type="text/event-stream")

@app.get("/api/documents")
@app.get("/documents")
async def list_documents():
    registry = load_registry()
    inventory = [{"filename": k, "chunks": v} for k, v in registry.items()]
    return {"status": "Success", "documents": inventory}

@app.post("/api/upload")
@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    
    contents = await file.read()
    reader = PdfReader(io.BytesIO(contents))
    raw_text = "".join([page.extract_text() or "" for page in reader.pages])
    
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
    chunks = text_splitter.split_text(raw_text)
    
    docs = [Document(page_content=c, metadata={"source": file.filename}) for c in chunks]
    
    v_store = get_vector_store()
    v_store.add_documents(documents=docs)
    
    registry = load_registry()
    registry[file.filename] = len(docs)
    save_registry(registry)
    
    return {"status": "Success", "message": f"Successfully injected {len(docs)} chunks into Pinecone Cloud!"}

class DeleteDocPayload(BaseModel):
    filename: str

@app.post("/api/documents/delete")
@app.post("/documents/delete")
async def delete_document(payload: DeleteDocPayload):
    try:
        v_store = get_vector_store()
        v_store.delete(filter={"source": payload.filename})
        registry = load_registry()
        if payload.filename in registry:
            del registry[payload.filename]
            save_registry(registry)
        return {"status": "Success", "message": f"Purged '{payload.filename}' from Pinecone."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api")
@app.get("/")
def read_root():
    return {"status": "Online"}
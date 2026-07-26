import os
import io
import json
from typing import Annotated, Literal, TypedDict
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from langchain_groq import ChatGroq
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool

from langchain_pinecone import PineconeVectorStore
from pinecone import Pinecone

from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from pypdf import PdfReader

load_dotenv()

app = FastAPI()

# Allow connections from Vercel domain and local testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. CORE AI ENGINES
llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0)
embeddings = GoogleGenerativeAIEmbeddings(model="gemini-embedding-2-preview", task_type="RETRIEVAL_DOCUMENT")

# 2. PINECONE CLOUD CONNECT
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
INDEX_NAME = os.getenv("PINECONE_INDEX_NAME")

pc = Pinecone(api_key=PINECONE_API_KEY)
vector_store = PineconeVectorStore(index_name=INDEX_NAME, embedding=embeddings)

# 3. PERSISTENT JSON REGISTRY HELPER (Supports Vercel ephemeral /tmp storage)
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

# 4. AGENT TOOLS
@tool
def query_knowledge_base(search_query: str) -> str:
    """Queries the Pinecone cloud database to fetch relevant text blocks from uploaded documents."""
    try:
        docs = vector_store.similarity_search(search_query, k=4)
        if not docs:
            return "No matching records found inside the cloud document collection."
        
        formatted_results = []
        for d in docs:
            source_file = d.metadata.get("source", "Unknown Document")
            formatted_results.append(f"[Source: {source_file}]\nContext:\n{d.page_content}")
        return "\n\n---\n\n".join(formatted_results)
    except Exception as e:
        return f"Cloud database query error: {str(e)}"

tools_map = {"query_knowledge_base": query_knowledge_base}
llm_with_tools = llm.bind_tools([query_knowledge_base])

# 5. LANGGRAPH STATE MACHINE
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]

def call_model_node(state: AgentState):
    system_instruction = SystemMessage(
        content="You are an advanced Agentic Knowledge Assistant with access to a cloud knowledge base. "
                "Always support your final answers with direct citations including the source filename."
    )
    response = llm_with_tools.invoke([system_instruction] + state["messages"])
    return {"messages": [response]}

def execute_tools_node(state: AgentState):
    last_message = state["messages"][-1]
    tool_outputs = []
    for tool_call in last_message.tool_calls:
        tool_func = tools_map[tool_call["name"]]
        output_content = tool_func.invoke(tool_call["args"])
        from langchain_core.messages import ToolMessage
        tool_outputs.append(ToolMessage(content=str(output_content), name=tool_call["name"], tool_call_id=tool_call["id"]))
    return {"messages": tool_outputs}

def should_continue_edge(state: AgentState) -> Literal["tools", "end"]:
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    return "end"

workflow = StateGraph(AgentState)
workflow.add_node("llm_agent", call_model_node)
workflow.add_node("tools", execute_tools_node)
workflow.set_entry_point("llm_agent")
workflow.add_conditional_edges("llm_agent", should_continue_edge, {"tools": "tools", "end": END})
workflow.add_edge("tools", "llm_agent")

agent_brain = workflow.compile(checkpointer=MemorySaver())

# 6. ROUTES
class ChatPayload(BaseModel):
    message: str
    thread_id: str = "default_session"

@app.post("/api/chat")
@app.post("/chat")
async def process_agent_chat(payload: ChatPayload):
    config = {"configurable": {"thread_id": payload.thread_id}}

    async def generate_tokens():
        async for event in agent_brain.astream_events(
            {"messages": [HumanMessage(content=payload.message)]},
            config=config,
            version="v2"
        ):
            if event["event"] == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                if hasattr(chunk, "content") and chunk.content:
                    yield f"data: {json.dumps({'content': chunk.content})}\n\n"

    return StreamingResponse(generate_tokens(), media_type="text/event-stream")

@app.get("/api/documents")
@app.get("/documents")
async def list_documents():
    """Returns persistent list of documents synced to Pinecone."""
    registry = load_registry()
    inventory = [{"filename": fname, "chunks": count} for fname, count in registry.items()]
    return {"status": "Success", "documents": inventory}

@app.post("/api/upload")
@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    contents = await file.read()
    reader = PdfReader(io.BytesIO(contents))
    raw_text = "".join([page.extract_text() or "" for page in reader.pages])
    
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
    chunks = text_splitter.split_text(raw_text)
    
    documents = [Document(page_content=chunk, metadata={"source": file.filename}) for chunk in chunks]
    vector_store.add_documents(documents=documents)
    
    # Save to persistent JSON registry
    registry = load_registry()
    registry[file.filename] = len(documents)
    save_registry(registry)
    
    return {"status": "Success", "message": f"Successfully injected {len(documents)} chunks into Pinecone Cloud!"}

class DeleteDocPayload(BaseModel):
    filename: str

@app.post("/api/documents/delete")
@app.post("/documents/delete")
async def delete_document(payload: DeleteDocPayload):
    try:
        vector_store.delete(filter={"source": payload.filename})
        registry = load_registry()
        if payload.filename in registry:
            del registry[payload.filename]
            save_registry(registry)
        return {"status": "Success", "message": f"Purged '{payload.filename}' from Pinecone Cloud."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")

@app.get("/api")
@app.get("/")
def read_root():
    return {"status": "Online"}
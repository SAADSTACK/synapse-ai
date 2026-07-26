import sys
import os
from fastapi import FastAPI

# System paths set karein
FILE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(FILE_DIR, ".."))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")

if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Top-level app variable import karein
try:
    from backend.main import app
except Exception as e1:
    try:
        from main import app
    except Exception as e2:
        # Fallback FastAPI app for Vercel static inspection
        app = FastAPI()

        @app.get("/")
        @app.get("/api")
        def fallback():
            return {"status": "error", "detail": f"Import failed: {str(e1)} | {str(e2)}"}
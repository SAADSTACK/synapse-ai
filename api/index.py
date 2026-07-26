import sys
import os

# Root aur Backend directory ko explicitly path mein add karein
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.abspath(os.path.join(current_dir, ".."))
backend_dir = os.path.abspath(os.path.join(parent_dir, "backend"))

sys.path.insert(0, parent_dir)
sys.path.insert(0, backend_dir)

from backend.main import app
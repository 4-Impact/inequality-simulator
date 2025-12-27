import os
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, StorageContext
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.embeddings.ollama import OllamaEmbedding
from llama_index.core import Settings
import chromadb

# --- Configuration ---
# Must match what is used in app.py
EMBED_MODEL = "nomic-embed-text:v1.5"
DB_PATH = "./chroma_db"
COLLECTION_NAME = "mesa_repo"

def ingest_code():
    print(f"Initializing Embedding Model: {EMBED_MODEL}...")
    Settings.embed_model = OllamaEmbedding(model_name=EMBED_MODEL)

    # 1. Select files to ingest
    # We focus on the core logic files
    target_files = [
        "model.py",
        "agent.py",
        "policyblocks.py",
        "utilities.py",
        "docs/app.js",
        "docs/index.html",
        "docs/landing.html",
        "blockly/index.html",
        "blockly/custom_blocks.js"
    ]
    
    # Check if files exist
    files_to_load = [f for f in target_files if os.path.exists(f)]
    if not files_to_load:
        print("No source files found! Make sure you are in the correct directory.")
        return

    print(f"Loading files: {files_to_load}")
    documents = SimpleDirectoryReader(input_files=files_to_load).load_data()

    # 2. Setup ChromaDB
    print(f"Connecting to ChromaDB at {DB_PATH}...")
    db = chromadb.PersistentClient(path=DB_PATH)
    chroma_collection = db.get_or_create_collection(COLLECTION_NAME)
    vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)

    # 3. Create/Update Index
    print("Creating Vector Index (this may take a moment)...")
    index = VectorStoreIndex.from_documents(
        documents, storage_context=storage_context
    )

    print("Ingestion Complete! The SLM now knows your codebase.")

if __name__ == "__main__":
    ingest_code()
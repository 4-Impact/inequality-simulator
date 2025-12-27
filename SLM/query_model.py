import chromadb
import sys
from llama_index.core import VectorStoreIndex, StorageContext
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.ollama import Ollama
from llama_index.embeddings.ollama import OllamaEmbedding 
from llama_index.core import Settings

# Configure Settings
#Settings.embed_model = HuggingFaceEmbedding(
#     model_name="BAAI/bge-small-en-v1.5")
model_name = "nomic-embed-text:v1.5" 

Settings.embed_model = OllamaEmbedding(model_name=model_name)
Settings.llm = Ollama(model="dolphin-llama3:8b", request_timeout=120.0)

# Set up vector db
db = chromadb.PersistentClient(path="./chroma_db")
chroma_collection = db.get_or_create_collection("mesa_repo")
vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
index = VectorStoreIndex.from_vector_store(
    vector_store=vector_store,
)

print("Index loaded")

# Set up query  
query_engine = index.as_query_engine(similarity_top_k=5)

query = "You are a policy assistant who is helping to generate code for " \
"a wealth inequality model. You will receive instructions on policy ideas and" \
"then need to generate python blockly code to integrate it into the base model. "


if len(sys.argv) > 1:
    query = query.join(sys.argv[1:])
else:
    query = query + "I want a policy that reduces wealth inequality while"\
    "optimizing total wealth growth."

print(query)
response = query_engine.query(query)

print("--- Answer ---")
print(str(response))
print("\n--- Sources Used ---")
for node in response.source_nodes:
    print(f"- {node.metadata.get('file_path')} (Score: {node.score:.4f})")
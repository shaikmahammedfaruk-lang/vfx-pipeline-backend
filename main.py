import os
import certifi
import cloudinary
import cloudinary.uploader
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel
from worker import render_trailer_task, celery
from celery.result import AsyncResult
from datetime import datetime, timedelta # Added for Phase 5

# --- CLOUDINARY SETUP ---
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET")
)

# --- MODELS ---
class UpdateAsset(BaseModel):
    title: str
    tags: str

class SequenceSave(BaseModel):
    sequence: list

# --- APP SETUP ---
app = FastAPI(title="Cinematic VFX Pipeline API")
app.add_middleware(
    CORSMiddleware, 
    allow_origins=["*"], 
    allow_methods=["*"], 
    allow_headers=["*"]
)

# --- DATABASE ---
MONGO_URL = os.getenv("MONGO_URL", "mongodb+srv://shaikmahammedfaruk_db_user:faruk%40123@cluster0.18nb4p7.mongodb.net/?retryWrites=true&w=majority")
client = AsyncIOMotorClient(MONGO_URL, tlsCAFile=certifi.where()) 
database = client.vfx_studio_db
assets_collection = database.get_collection("vfx_assets")
sequence_collection = database.get_collection("trailer_sequences")

# --- ENDPOINTS ---
@app.get("/api/system-status")
async def get_system_status():
    return {"mongodb": "Connected", "api": "Online"}

@app.post("/api/sequence/save")
async def save_sequence(data: SequenceSave):
    # Added created_at timestamp for Phase 5 cleanup functionality
    await sequence_collection.replace_one(
        {"id": "main"}, 
        {"data": data.sequence, "created_at": datetime.utcnow()}, 
        upsert=True
    )
    return {"message": "Sequence saved successfully"}

# --- PHASE 5: CLEANUP ENDPOINT ---
@app.delete("/api/cleanup-old-sequences")
async def cleanup_sequences():
    # Deletes sequences older than 24 hours
    limit = datetime.utcnow() - timedelta(hours=24)
    result = await sequence_collection.delete_many({"created_at": {"$lt": limit}})
    return {"status": "Success", "deleted_count": result.deleted_count}

@app.get("/api/sequence")
async def get_sequence():
    doc = await sequence_collection.find_one({"id": "main"})
    return {"sequence": doc["data"] if doc else []}

@app.post("/api/render-trailer")
async def render_trailer(data: SequenceSave):
    if not data.sequence:
        return {"status": "Error", "message": "Sequence is empty"}
    task = render_trailer_task.delay(data.sequence)
    return {"status": "Accepted", "task_id": task.id}

@app.get("/api/render-status/{task_id}")
async def get_render_status(task_id: str):
    task_result = AsyncResult(task_id, app=celery)
    response = {"status": task_result.status, "progress": 0, "result": None}
    
    if task_result.state == 'PROGRESS':
        response["progress"] = task_result.info.get('percent', 0)
    
    if task_result.ready():
        response["progress"] = 100
        response["result"] = task_result.result
        
    return response

@app.post("/api/upload-asset")
async def upload_asset(
    title: str = Form(...), 
    tags: str = Form(...), 
    lens_type: str = Form(...), 
    frame_rate: str = Form(...), 
    file: UploadFile = File(...)
):
    upload_result = cloudinary.uploader.upload(file.file, resource_type="video", folder="vfx_pipeline")
    video_url = upload_result.get("secure_url")
    
    await assets_collection.insert_one({
        "asset_title": title,
        "file_url": video_url, 
        "technical_tags": [tag.strip() for tag in tags.split(",")],
        "metadata": {"lens": lens_type, "fps": frame_rate}
    })
    return {"status": "Success", "message": "Asset uploaded with technical metadata!"}

@app.get("/api/assets")
async def get_all_assets():
    assets = [doc async for doc in assets_collection.find({})]
    for a in assets: a["_id"] = str(a["_id"])
    return {"assets": assets}

@app.delete("/api/assets/{asset_id}")
async def delete_asset(asset_id: str):
    await assets_collection.delete_one({"_id": ObjectId(asset_id)})
    return {"status": "Success"}

@app.put("/api/assets/{asset_id}")
async def update_asset(asset_id: str, asset_data: UpdateAsset):
    tags_list = [t.strip() for t in asset_data.tags.split(",")]
    await assets_collection.update_one(
        {"_id": ObjectId(asset_id)}, 
        {"$set": {"asset_title": asset_data.title, "technical_tags": tags_list}}
    )
    return {"status": "Success"}
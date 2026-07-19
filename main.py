from moviepy import VideoFileClip, concatenate_videoclips
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel
import shutil
import os
import cv2
import numpy as np
import certifi

# --- MODELS ---
class UpdateAsset(BaseModel):
    title: str
    tags: str

class SequenceSave(BaseModel):
    sequence: list

# --- APP SETUP ---
app = FastAPI(title="Cinematic VFX Pipeline API")

MEDIA_DIR = "./media"
if not os.path.exists(MEDIA_DIR):
    os.makedirs(MEDIA_DIR)

app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DATABASE ---
MONGO_URL = "mongodb+srv://shaikmahammedfaruk_db_user:faruk%40123@cluster0.18nb4p7.mongodb.net/?retryWrites=true&w=majority"
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
    await sequence_collection.replace_one({"id": "main"}, {"data": data.sequence}, upsert=True)
    return {"message": "Sequence saved successfully"}

@app.get("/api/sequence")
async def get_sequence():
    doc = await sequence_collection.find_one({"id": "main"})
    return {"sequence": doc["data"] if doc else []}

# --- RENDER ENGINE (Updated to accept sequence data directly) ---
@app.post("/api/render-trailer")
async def render_trailer(data: SequenceSave):
    sequence = data.sequence
    if not sequence:
        return {"status": "Error", "message": "Sequence is empty"}

    clips = []
    try:
        for asset in sequence:
            file_path = os.path.join(MEDIA_DIR, asset["file_name"])
            if os.path.exists(file_path):
                clips.append(VideoFileClip(file_path))
        
        if not clips:
            return {"status": "Error", "message": "No valid video files found on server"}

        final_clip = concatenate_videoclips(clips)
        output_path = os.path.join(MEDIA_DIR, "final_trailer.mp4")
        
        final_clip.write_videofile(output_path, codec="libx264", audio_codec="aac")
        
        # Cleanup
        final_clip.close()
        for clip in clips: clip.close()
        
        return {"status": "Success", "url": "/media/final_trailer.mp4"}
    except Exception as e:
        return {"status": "Error", "message": str(e)}

# --- ASSET MANAGEMENT ---
@app.post("/api/upload-asset")
async def upload_asset(title: str, tags: str, file: UploadFile = File(...)):
    file_path = os.path.join(MEDIA_DIR, file.filename)
    with open(file_path, "wb") as disk_file:
        shutil.copyfileobj(file.file, disk_file)
    
    auto_tags = [tag.strip() for tag in tags.split(",")]
    thumbnail_name = f"thumb_{file.filename}.jpg"
    
    if file.content_type.startswith("video/"):
        clip = VideoFileClip(file_path)
        clip.save_frame(os.path.join(MEDIA_DIR, thumbnail_name), t=0.0)
        clip.close()

    db_entry = await assets_collection.insert_one({
        "asset_title": title, "file_name": file.filename,
        "thumbnail_file": thumbnail_name, "technical_tags": auto_tags
    })
    return {"status": "Success", "message": "Asset processed!"}

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
    await assets_collection.update_one({"_id": ObjectId(asset_id)}, {"$set": {"asset_title": asset_data.title, "technical_tags": asset_data.tags.split(",")}})
    return {"status": "Success"}
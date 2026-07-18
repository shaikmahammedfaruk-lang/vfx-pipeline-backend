from moviepy.video.io.VideoFileClip import VideoFileClip
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import shutil
import os
import cv2
import numpy as np
from pydantic import BaseModel
import certifi

class UpdateAsset(BaseModel):
    title: str
    tags: str

app = FastAPI(title="Cinematic VFX Pipeline API")

# Ensure the media directory exists
MEDIA_DIR = "./media"
if not os.path.exists(MEDIA_DIR):
    os.makedirs(MEDIA_DIR)

# Mount the media folder correctly
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MONGO_URL = "mongodb+srv://shaikmahammedfaruk_db_user:faruk%40123@cluster0.18nb4p7.mongodb.net/?retryWrites=true&w=majority"
client = AsyncIOMotorClient(MONGO_URL, tlsCAFile=certifi.where()) 
database = client.vfx_studio_db
assets_collection = database.get_collection("vfx_assets")

def analyze_mood(thumbnail_path):
    try:
        img = cv2.imread(thumbnail_path)
        if img is None: return "Unknown"
        img = cv2.resize(img, (50, 50))
        avg_color_per_row = np.average(img, axis=0)
        avg_color = np.average(avg_color_per_row, axis=0)
        
        # avg_color is [Blue, Green, Red]
        if avg_color[2] > 140: return "Warm/Epic"
        elif avg_color[0] < 60 and avg_color[1] < 60 and avg_color[2] < 60: return "Dark/Horror"
        else: return "Balanced"
    except Exception as e:
        print(f"Mood analysis error: {e}")
        return "Uncategorized"

@app.post("/api/upload-asset")
async def upload_asset(title: str, tags: str, file: UploadFile = File(...)):
    # Save file into the /media folder
    file_path = os.path.join(MEDIA_DIR, file.filename)
    with open(file_path, "wb") as disk_file:
        shutil.copyfileobj(file.file, disk_file)
    
    auto_tags = [tag.strip() for tag in tags.split(",")]
    thumbnail_name = None
    mood_tag = "General"
    
    if file.content_type.startswith("video/"):
        try:
            clip = VideoFileClip(file_path)
            res_tag = f"{clip.size[0]}x{clip.size[1]}"
            dur_tag = f"{int(clip.duration)}s"
            auto_tags.extend([res_tag, dur_tag])
            
            thumbnail_name = f"thumb_{file.filename}.jpg"
            thumb_path = os.path.join(MEDIA_DIR, thumbnail_name)
            clip.save_frame(thumb_path, t=0.0)
            clip.close()
            
            # Perform Phase 3 Mood Analysis
            mood_tag = analyze_mood(thumb_path)
            auto_tags.append(mood_tag)
        except Exception as e:
            print(f"Processing error: {e}")

    media_metadata = {
        "asset_title": title,
        "file_name": file.filename,
        "thumbnail_file": thumbnail_name,
        "file_type": file.content_type,
        "technical_tags": auto_tags
    }
    
    db_entry = await assets_collection.insert_one(media_metadata)
    return {"status": "Success", "message": f"Asset processed as {mood_tag}!", "mongodb_id": str(db_entry.inserted_id)}

@app.get("/api/assets")
async def get_all_assets():
    assets = []
    cursor = assets_collection.find({})
    async for document in cursor:
        document["_id"] = str(document["_id"])
        assets.append(document)
    return {"assets": assets}

@app.delete("/api/assets/{asset_id}")
async def delete_asset(asset_id: str):
    result = await assets_collection.delete_one({"_id": ObjectId(asset_id)})
    return {"status": "Success"} if result.deleted_count == 1 else {"status": "Error"}

@app.put("/api/assets/{asset_id}")
async def update_asset(asset_id: str, asset_data: UpdateAsset):
    new_tags = [tag.strip() for tag in asset_data.tags.split(",")]
    await assets_collection.update_one(
        {"_id": ObjectId(asset_id)},
        {"$set": {"asset_title": asset_data.title, "technical_tags": new_tags}}
    )
    return {"status": "Success"}
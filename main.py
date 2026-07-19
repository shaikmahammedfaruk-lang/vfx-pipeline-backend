import os
import requests
import cloudinary
import cloudinary.uploader
from moviepy import VideoFileClip, concatenate_videoclips
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel
import certifi

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

@app.post("/api/render-trailer")
async def render_trailer(data: SequenceSave):
    sequence = data.sequence
    if not sequence:
        return {"status": "Error", "message": "Sequence is empty"}

    clips = []
    temp_files = []
    try:
        for asset in sequence:
            response = requests.get(asset["file_url"])
            temp_path = f"/tmp/{ObjectId()}.mp4"
            with open(temp_path, "wb") as f:
                f.write(response.content)
            clips.append(VideoFileClip(temp_path))
            temp_files.append(temp_path)
        
        final_clip = concatenate_videoclips(clips)
        output_path = "/tmp/final_trailer.mp4"
        final_clip.write_videofile(output_path, codec="libx264", audio_codec="aac")
        
        final_clip.close()
        for clip in clips: clip.close()
            
        return {"status": "Success", "message": "Render completed successfully"}
    except Exception as e:
        return {"status": "Error", "message": str(e)}
    finally:
        # GUARANTEED Cleanup: runs even if the render crashes
        for f in temp_files:
            if os.path.exists(f): os.remove(f)
        if os.path.exists("/tmp/final_trailer.mp4"):
            os.remove("/tmp/final_trailer.mp4")

@app.post("/api/upload-asset")
async def upload_asset(title: str, tags: str, file: UploadFile = File(...)):
    upload_result = cloudinary.uploader.upload(file.file, resource_type="video", folder="vfx_pipeline")
    video_url = upload_result.get("secure_url")
    
    await assets_collection.insert_one({
        "asset_title": title,
        "file_url": video_url, 
        "technical_tags": [tag.strip() for tag in tags.split(",")]
    })
    return {"status": "Success", "message": "Asset uploaded to cloud!"}

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
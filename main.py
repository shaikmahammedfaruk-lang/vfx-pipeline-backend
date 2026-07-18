from moviepy.video.io.VideoFileClip import VideoFileClip
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import shutil
from pydantic import BaseModel
import certifi  # NEW: Import the security certificates

# A strict blueprint so Python knows what the edit data looks like
class UpdateAsset(BaseModel):
    title: str
    tags: str

# 1. Start the FastAPI Engine
app = FastAPI(title="Cinematic VFX Pipeline API")

# Allow React to view the saved media files
app.mount("/media", StaticFiles(directory="."), name="media")

# 2. Open the gates so our future React frontend can talk to this backend safely
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Connect to the MongoDB Storage Box
# 3. Connect to the MongoDB Storage Box
MONGO_URL = "mongodb+srv://shaikmahammedfaruk_db_user:faruk%40123@cluster0.18nb4p7.mongodb.net/?retryWrites=true&w=majority"

# NEW: Tell Motor to use the certifi package for the SSL handshake
client = AsyncIOMotorClient(MONGO_URL, tlsCAFile=certifi.where()) 

database = client.vfx_studio_db
assets_collection = database.get_collection("vfx_assets")

# 4. Create a system check endpoint
@app.get("/api/system-status")
async def system_status():
    return {"fastapi_backend": "Online", "mongodb_status": "Connected"}

# 5. Create the Advanced Media Upload Engine with Auto-Metadata & Thumbnails
@app.post("/api/upload-asset")
async def upload_asset(title: str, tags: str, file: UploadFile = File(...)):
    local_storage_path = f"./{file.filename}"
    with open(local_storage_path, "wb") as disk_file:
        shutil.copyfileobj(file.file, disk_file)
    
    auto_tags = [tag.strip() for tag in tags.split(",")]
    thumbnail_name = None  # NEW: Memory space for our thumbnail filename
    
    if file.content_type.startswith("video/"):
        try:
            clip = VideoFileClip(local_storage_path)
            res_tag = f"{clip.size[0]}x{clip.size[1]}"
            dur_tag = f"{int(clip.duration)}s"
            auto_tags.extend([res_tag, dur_tag])
            
            # NEW: Extract the very first frame (at 0.0 seconds) as a thumbnail
            thumbnail_name = f"thumb_{file.filename}.jpg"
            clip.save_frame(f"./{thumbnail_name}", t=0.0)
            
            clip.close()
        except Exception as e:
            print(f"Could not extract metadata: {e}")

    media_metadata = {
        "asset_title": title,
        "file_name": file.filename,
        "thumbnail_file": thumbnail_name, # NEW: Save the thumbnail reference to MongoDB
        "saved_location": local_storage_path,
        "file_type": file.content_type,
        "technical_tags": auto_tags
    }
    
    db_entry = await assets_collection.insert_one(media_metadata)
    
    return {
        "status": "Success",
        "message": f"Asset '{title}' processed with metadata and thumbnail!",
        "mongodb_id": str(db_entry.inserted_id)
    }

# 6. Fetch all assets to display in the React Asset Vault
@app.get("/api/assets")
async def get_all_assets():
    assets = []
    cursor = assets_collection.find({})
    async for document in cursor:
        document["_id"] = str(document["_id"])
        assets.append(document)
    return {"assets": assets}

# 7. Delete an asset from the vault
@app.delete("/api/assets/{asset_id}")
async def delete_asset(asset_id: str):
    result = await assets_collection.delete_one({"_id": ObjectId(asset_id)})
    if result.deleted_count == 1:
        return {"status": "Success", "message": "Asset deleted permanently."}
    return {"status": "Error", "message": "Asset not found."}

# 8. Update an existing asset's metadata
@app.put("/api/assets/{asset_id}")
async def update_asset(asset_id: str, asset_data: UpdateAsset):
    new_tags = [tag.strip() for tag in asset_data.tags.split(",")]
    
    await assets_collection.update_one(
        {"_id": ObjectId(asset_id)},
        {"$set": {
            "asset_title": asset_data.title,
            "technical_tags": new_tags
        }}
    )
    return {"status": "Success", "message": "Asset updated successfully!"}
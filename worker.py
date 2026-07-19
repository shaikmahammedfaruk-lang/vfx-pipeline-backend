import os
import requests
from celery import Celery
from moviepy import VideoFileClip, concatenate_videoclips
import cloudinary
import cloudinary.uploader
from bson import ObjectId

# --- CLOUDINARY SETUP ---
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET")
)

# --- CELERY SETUP ---
REDIS_URL = "rediss://default:gQAAAAAAAohWAAIgcDE2MDIxMzc3ZmI3YzQ0NDAzOGIzN2MxMzkyOTM0ZDc1OQ@sunny-snail-165974.upstash.io:6379?ssl_cert_reqs=CERT_NONE"

celery = Celery(
    'tasks', 
    broker=REDIS_URL, 
    backend=REDIS_URL
)

# Ensure local temp directory exists
TEMP_DIR = "temp_files"
if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR)

@celery.task(name="render_trailer_task")
def render_trailer_task(sequence):
    clips = []
    temp_files = []
    output_path = os.path.join(TEMP_DIR, f"final_{ObjectId()}.mp4")
    fade_duration = 0.5
    
    try:
        for asset in sequence:
            # Download file
            response = requests.get(asset["file_url"])
            temp_path = os.path.join(TEMP_DIR, f"{ObjectId()}.mp4")
            with open(temp_path, "wb") as f:
                f.write(response.content)
            
            # Process with moviepy using the stable fadein method for v2.x
            clip = VideoFileClip(temp_path)
            clip = clip.fadein(fade_duration)
            clips.append(clip)
            temp_files.append(temp_path)
        
        # Concatenate using compose method
        final_clip = concatenate_videoclips(clips, method="compose", padding=-fade_duration)
        final_clip.write_videofile(output_path, codec="libx264", audio_codec="aac")
        
        final_clip.close()
        for clip in clips: clip.close()
            
        # Upload result to Cloudinary
        upload_result = cloudinary.uploader.upload(output_path, resource_type="video", folder="final_trailers")
        return {"status": "Success", "url": upload_result.get("secure_url")}
        
    except Exception as e:
        return {"status": "Error", "message": str(e)}
        
    finally:
        # Guaranteed Cleanup
        for f in temp_files:
            if os.path.exists(f): os.remove(f)
        if os.path.exists(output_path):
            os.remove(output_path)
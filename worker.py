import os
import requests
from celery import Celery
from moviepy import VideoFileClip, concatenate_videoclips
import cloudinary
import cloudinary.uploader
from bson import ObjectId

# --- CLOUDINARY SETUP ---
# Ensure these environment variables are set in your environment
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET")
)

# --- CELERY SETUP ---
# Use the 'rediss://' scheme for secure SSL connections to Upstash
# Use the full TCP URL you copied from the TCP tab
# Update the REDIS_URL line in worker.py to look exactly like this:
REDIS_URL = "rediss://default:gQAAAAAAAohWAAIgcDE2MDIxMzc3ZmI3YzQ0NDAzOGIzN2MxMzkyOTM0ZDc1OQ@sunny-snail-165974.upstash.io:6379?ssl_cert_reqs=CERT_NONE"

celery = Celery(
    'tasks', 
    broker=REDIS_URL, 
    backend=REDIS_URL
)

@celery.task(name="render_trailer_task")
def render_trailer_task(sequence):
    clips = []
    temp_files = []
    # Create a unique output path
    output_path = f"/tmp/final_{ObjectId()}.mp4"
    fade_duration = 0.5
    
    try:
        for asset in sequence:
            # Download file
            response = requests.get(asset["file_url"])
            temp_path = f"/tmp/{ObjectId()}.mp4"
            with open(temp_path, "wb") as f:
                f.write(response.content)
            
            # Process with moviepy
            clip = VideoFileClip(temp_path)
            clip = clip.crossfadein(fade_duration)
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
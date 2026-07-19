import os
import time
import requests
from dotenv import load_dotenv
from celery import Celery
from moviepy import VideoFileClip, concatenate_videoclips, TextClip, CompositeVideoClip
import cloudinary
import cloudinary.uploader
from bson import ObjectId

load_dotenv()

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET")
)

REDIS_URL = "rediss://default:gQAAAAAAAohWAAIgcDE2MDIxMzc3ZmI3YzQ0NDAzOGIzN2MxMzkyOTM0ZDc1OQ@sunny-snail-165974.upstash.io:6379?ssl_cert_reqs=CERT_NONE"
celery = Celery('tasks', broker=REDIS_URL, backend=REDIS_URL)

TEMP_DIR = "temp_files"
if not os.path.exists(TEMP_DIR): os.makedirs(TEMP_DIR)

@celery.task(name="render_trailer_task", bind=True)
def render_trailer_task(self, sequence):
    clips = []
    temp_files = []
    unique_id = f"{ObjectId()}_{int(time.time())}"
    output_path = os.path.join(TEMP_DIR, f"final_{unique_id}.mp4")
    fade_duration = 0.5
    
    try:
        total_assets = len(sequence)
        for i, asset in enumerate(sequence):
            response = requests.get(asset["file_url"])
            temp_path = os.path.join(TEMP_DIR, f"{unique_id}_{i}.mp4")
            with open(temp_path, "wb") as f: f.write(response.content)
            
            clip = VideoFileClip(temp_path)
            
            # --- PHASE 4: STABLE VFX APPLICATION ---
            try:
                from moviepy.video.fx import colorx
                clip = colorx(clip, 1.2)
            except:
                pass
            
            if hasattr(clip, "fadein"): clip = clip.fadein(fade_duration)
            clips.append(clip)
            temp_files.append(temp_path)
            
            progress = int(((i + 1) / total_assets) * 100)
            self.update_state(state='PROGRESS', meta={'percent': progress})
        
        final_clip = concatenate_videoclips(clips, method="compose", padding=-fade_duration)
        
        watermark = TextClip(
            "ECHOES OF ETERNITY", font_size=50, color='white', 
            font='Arial', method='caption', size=(final_clip.w, None)
        ).with_duration(final_clip.duration).with_position(("center", "bottom"))
        
        final_clip = CompositeVideoClip([final_clip, watermark])
        final_clip.write_videofile(output_path, codec="libx264", audio_codec="aac")
        
        final_clip.close()
        for clip in clips: clip.close()
            
        upload_result = cloudinary.uploader.upload(output_path, resource_type="video", folder="final_trailers")
        return {"status": "Success", "url": upload_result.get("secure_url")}
    except Exception as e:
        return {"status": "Error", "message": str(e)}
    finally:
        for f in temp_files:
            if os.path.exists(f): os.remove(f)
        if os.path.exists(output_path): os.remove(output_path)
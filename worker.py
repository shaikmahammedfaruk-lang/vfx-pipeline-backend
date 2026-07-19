import os
import time
import requests
from dotenv import load_dotenv
from celery import Celery
from moviepy import VideoFileClip, concatenate_videoclips, TextClip, CompositeVideoClip, AudioFileClip
import cloudinary
import cloudinary.uploader
from bson import ObjectId

# Load environment variables
load_dotenv()

# --- CLOUDINARY SETUP ---
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET")
)

# --- CELERY SETUP ---
REDIS_URL = "rediss://default:gQAAAAAAAohWAAIgcDE2MDIxMzc3ZmI3YzQ0NDAzOGIzN2MxMzkyOTM0ZDc1OQ@sunny-snail-165974.upstash.io:6379?ssl_cert_reqs=CERT_NONE"
# Renamed from 'celery' to 'celery_app' to prevent naming conflicts
celery_app = Celery('tasks', broker=REDIS_URL, backend=REDIS_URL)

TEMP_DIR = "temp_files"
if not os.path.exists(TEMP_DIR): os.makedirs(TEMP_DIR)

@celery_app.task(name="render_trailer_task", bind=True)
def render_trailer_task(self, sequence, audio_url=None):
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
            
            # --- VFX APPLICATION ---
            try:
                from moviepy.video.fx import colorx
                clip = clip.with_effects([colorx(1.2)])
            except: pass
            
            # Fade in transition
            clip = clip.with_effects([lambda c: c.fadein(fade_duration)])
            clips.append(clip)
            temp_files.append(temp_path)
            
            progress = int(((i + 1) / total_assets) * 100)
            self.update_state(state='PROGRESS', meta={'percent': progress})
        
        # Concatenate with cross-fade effect
        final_clip = concatenate_videoclips(clips, method="compose", padding=-fade_duration)
        
        # --- AUDIO INTEGRATION ---
        if audio_url:
            audio_path = os.path.join(TEMP_DIR, f"audio_{unique_id}.mp3")
            audio_response = requests.get(audio_url)
            with open(audio_path, "wb") as f: f.write(audio_response.content)
            temp_files.append(audio_path)
            
            background_audio = AudioFileClip(audio_path)
            
            # Ensure audio length matches video
            if background_audio.duration > final_clip.duration:
                background_audio = background_audio.subclipped(0, final_clip.duration)
            
            final_clip = final_clip.with_audio(background_audio)
        
        # --- WATERMARK ---
        watermark = TextClip(
            text="ECHOES OF ETERNITY", 
            font_size=50, 
            color="white", 
            method="caption", 
            size=(final_clip.w, None)
        ).with_duration(final_clip.duration).with_position(("center", "bottom"))
        
        final_clip = CompositeVideoClip([final_clip, watermark])
        final_clip.write_videofile(output_path, codec="libx264", audio_codec="aac")
        
        # Cleanup
        final_clip.close()
        for clip in clips: clip.close()
            
        upload_result = cloudinary.uploader.upload(output_path, resource_type="video", folder="final_trailers")
        return {"status": "Success", "url": upload_result.get("secure_url")}
        
    except Exception as e:
        return {"status": "Error", "message": str(e)}
        
    finally:
        for clip in clips:
            try: clip.close()
            except: pass
            
        time.sleep(1) # Allow OS to release file locks
        
        for f in temp_files:
            try:
                if os.path.exists(f): os.remove(f)
            except: pass
        if os.path.exists(output_path):
            try: os.remove(output_path)
            except: pass
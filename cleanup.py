import os
import time

# --- CONFIGURATION ---
TEMP_DIR = "temp_files"
MAX_AGE_SECONDS = 3600  # 1 hour

def cleanup_temp_files():
    """Removes files in temp_files older than MAX_AGE_SECONDS."""
    if not os.path.exists(TEMP_DIR):
        print(f"Directory {TEMP_DIR} does not exist. Skipping.")
        return

    now = time.time()
    files_deleted = 0
    
    for filename in os.listdir(TEMP_DIR):
        file_path = os.path.join(TEMP_DIR, filename)
        
        # Ensure it is a file (not a subdirectory)
        if os.path.isfile(file_path):
            try:
                # Check if file is older than MAX_AGE_SECONDS
                if os.stat(file_path).st_mtime < now - MAX_AGE_SECONDS:
                    os.remove(file_path)
                    print(f"Successfully deleted old file: {filename}")
                    files_deleted += 1
            except Exception as e:
                print(f"Error deleting {filename}: {e}")
                
    print(f"Cleanup complete. Total files removed: {files_deleted}")

if __name__ == "__main__":
    print("Starting system cleanup...")
    cleanup_temp_files()
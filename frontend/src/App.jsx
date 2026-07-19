import { useState, useEffect } from 'react'
import './App.css'

const API_BASE_URL = 'https://vfx-pipeline-backend.onrender.com'

function App() {
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [lensType, setLensType] = useState('')
  const [frameRate, setFrameRate] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [voScript, setVoScript] = useState('') // New state for VO script
  const [file, setFile] = useState(null)
  const [message, setMessage] = useState('')
  const [vaultAssets, setVaultAssets] = useState([])
  const [loading, setLoading] = useState(false)
  const [sequence, setSequence] = useState([])
  const [systemStatus, setSystemStatus] = useState({ mongodb: 'Checking...', api: 'Checking...' })
  const [finalTrailerUrl, setFinalTrailerUrl] = useState('')
  const [renderProgress, setRenderProgress] = useState(0)

  const fetchData = async () => {
    try {
      const [assetRes, seqRes, statusRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/assets`),
        fetch(`${API_BASE_URL}/api/sequence`),
        fetch(`${API_BASE_URL}/api/system-status`)
      ]);

      const assetData = await assetRes.json();
      const seqData = await seqRes.json();
      const statusData = await statusRes.json();

      setVaultAssets(Array.isArray(assetData.assets) ? assetData.assets : []);
      setSequence(seqData.sequence || []);
      setSystemStatus(statusData);
    } catch (error) { 
      console.error("Initialization error:", error);
    }
  }

  useEffect(() => { fetchData() }, [])

  // --- NEW: VOICE-OVER GENERATION ---
  const generateVoiceOver = async () => {
    if (!voScript) { setMessage("Please enter a script first!"); return; }
    setMessage("Generating Voice-Over...");
    try {
      const formData = new FormData();
      formData.append('text', voScript);
      
      const res = await fetch(`${API_BASE_URL}/api/generate-voiceover`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setAudioUrl(data.audio_url);
      setMessage("Voice-Over Ready!");
    } catch (err) {
      setMessage("Voice-Over generation failed.");
    }
  };

  const deleteAsset = async (id) => {
    await fetch(`${API_BASE_URL}/api/assets/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const renderTrailer = async () => {
    if (sequence.length === 0) {
      setMessage("Sequence is empty. Add assets first!");
      return;
    }
    
    setMessage("Render started...");
    setFinalTrailerUrl('');
    setRenderProgress(0);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/render-trailer`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence, audio_url: audioUrl }) 
      });
      const data = await response.json();
      
      if (data.status === 'Accepted') {
        const taskId = data.task_id;
        const interval = setInterval(async () => {
          const statusRes = await fetch(`${API_BASE_URL}/api/render-status/${taskId}`);
          const statusData = await statusRes.json();
          
          if (statusData.status === 'PROGRESS') {
            setRenderProgress(statusData.progress);
            setMessage(`Rendering: ${statusData.progress}%`);
          } else if (statusData.status === 'SUCCESS') {
            clearInterval(interval);
            setRenderProgress(100);
            setMessage("Render Complete!");
            setFinalTrailerUrl(statusData.result.url);
          } else if (statusData.status === 'FAILURE') {
            clearInterval(interval);
            setMessage("Render Failed.");
          }
        }, 2000);
      } else {
        setMessage(`Error: ${data.message}`);
      }
    } catch (err) { 
      setMessage("Failed to connect to render service."); 
    }
  };

  const addToSequence = (asset) => setSequence([...sequence, asset]);
  const removeFromSequence = (index) => setSequence(sequence.filter((_, i) => i !== index));

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file) return;
    setLoading(true); setMessage("Uploading...");
    
    const formData = new FormData(); 
    formData.append('file', file);
    formData.append('title', title);
    formData.append('tags', tags);
    formData.append('lens_type', lensType);
    formData.append('frame_rate', frameRate);
    
    try {
      await fetch(`${API_BASE_URL}/api/upload-asset`, {
        method: 'POST', 
        body: formData
      });
      setTitle(''); setTags(''); setLensType(''); setFrameRate(''); setFile(null); fetchData();
      setMessage("Asset uploaded!");
    } catch (error) { setMessage('Upload failed.') } finally { setLoading(false) }
  }

  return (
    <div className="dashboard-layout">
      <div className="sidebar">
        <h1>VFX PIPELINE</h1>
        <form onSubmit={handleUpload} className="upload-form">
          <input type="text" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <input type="text" placeholder="Tags" value={tags} onChange={(e) => setTags(e.target.value)} required />
          <input type="text" placeholder="Lens Type" value={lensType} onChange={(e) => setLensType(e.target.value)} required />
          <input type="text" placeholder="Frame Rate" value={frameRate} onChange={(e) => setFrameRate(e.target.value)} required />
          <input type="file" onChange={(e) => setFile(e.target.files[0])} required />
          <button type="submit" disabled={loading}>{loading ? "Processing..." : "Process & Upload"}</button>
        </form>
        
        {/* Audio URL Input */}
        <input 
            type="text" 
            placeholder="Audio URL (Background Music)" 
            value={audioUrl} 
            onChange={(e) => setAudioUrl(e.target.value)} 
            style={{ marginTop: '20px', width: '100%' }}
        />

        {/* Voice-Over Generation Section */}
        <div className="voiceover-section" style={{ marginTop: '20px' }}>
          <textarea 
            placeholder="Enter Voice-Over Script..." 
            value={voScript}
            onChange={(e) => setVoScript(e.target.value)} 
            style={{ width: '100%', height: '80px' }}
          />
          <button onClick={generateVoiceOver} style={{ marginTop: '10px', width: '100%' }}>
            Generate Voice-Over
          </button>
        </div>
        
        {message && <div className="status-box">{message}</div>}
      </div>

      <div className="vault-section">
        <h2>ASSET VAULT</h2>
        <div className="asset-grid">
          {vaultAssets.map((asset) => (
            <div key={asset._id} className="asset-card">
              <video src={asset.file_url} controls className="asset-thumbnail" />
              <div className="asset-title">{asset.asset_title}</div>
              <button onClick={() => addToSequence(asset)}>+ Add</button>
              <button onClick={() => deleteAsset(asset._id)} style={{ background: '#ef4444' }}>Delete</button>
            </div>
          ))}
        </div>
      </div>

      <div className="status-panel">
        <h3>SYSTEM STATUS</h3>
        <p>🚀 FastAPI: {systemStatus.api} | 🗄️ MongoDB: {systemStatus.mongodb}</p>
        <button onClick={renderTrailer}>🚀 Render Final Trailer</button>
        
        {renderProgress > 0 && renderProgress < 100 && (
            <div className="progress-container" style={{ width: '100%', background: '#ccc', margin: '10px 0' }}>
                <div style={{ width: `${renderProgress}%`, background: '#4caf50', height: '20px' }}></div>
            </div>
        )}
        
        {finalTrailerUrl && (
          <div className="final-output">
            <h4>Final Trailer Ready:</h4>
            <video src={finalTrailerUrl} controls width="100%" />
            <a href={finalTrailerUrl} target="_blank" rel="noreferrer">Download Full Trailer</a>
          </div>
        )}

        <div className="sequence-grid">
          {sequence.map((asset, index) => (
            <div key={index} className="sequence-item">
              <video src={asset.file_url} style={{ height: '50px', width: '80px' }} />
              <button onClick={() => removeFromSequence(index)}>X</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
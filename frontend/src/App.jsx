import { useState, useEffect } from 'react'
import './App.css'

const API_BASE_URL = 'https://vfx-pipeline-backend.onrender.com'

function App() {
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [file, setFile] = useState(null)
  const [message, setMessage] = useState('')
  const [vaultAssets, setVaultAssets] = useState([])
  const [loading, setLoading] = useState(false)
  const [sequence, setSequence] = useState([])
  const [systemStatus, setSystemStatus] = useState({ mongodb: 'Checking...', api: 'Checking...' })

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

  const deleteAsset = async (id) => {
    await fetch(`${API_BASE_URL}/api/assets/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const renderTrailer = async () => {
    if (sequence.length === 0) {
      setMessage("Sequence is empty. Add assets first!");
      return;
    }
    setMessage("Rendering...");
    try {
      const response = await fetch(`${API_BASE_URL}/api/render-trailer`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence }) 
      });
      const data = await response.json();
      if(data.status === 'Success') setMessage(`Render Complete!`);
      else setMessage(`Render failed: ${data.message}`);
    } catch (err) { setMessage("Render failed."); }
  };

  const addToSequence = (asset) => setSequence([...sequence, asset]);
  const removeFromSequence = (index) => setSequence(sequence.filter((_, i) => i !== index));

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file) return;
    setLoading(true); setMessage("Uploading to Cloud...");
    const formData = new FormData(); formData.append('file', file);
    try {
      await fetch(`${API_BASE_URL}/api/upload-asset?title=${encodeURIComponent(title)}&tags=${encodeURIComponent(tags)}`, {
        method: 'POST', body: formData
      });
      setTitle(''); setTags(''); setFile(null); fetchData();
      setMessage("Asset uploaded to Cloud!");
    } catch (error) { setMessage('Upload failed.') } finally { setLoading(false) }
  }

  return (
    <div className="dashboard-layout">
      <div className="sidebar">
        <h1>VFX PIPELINE</h1>
        <form onSubmit={handleUpload} className="upload-form">
          <input type="text" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <input type="text" placeholder="Tags" value={tags} onChange={(e) => setTags(e.target.value)} required />
          <input type="file" onChange={(e) => setFile(e.target.files[0])} required />
          <button type="submit" disabled={loading}>{loading ? "Processing..." : "Process & Upload"}</button>
        </form>
        {message && <div className="status-box">{message}</div>}
      </div>

      <div className="vault-section">
        <h2>ASSET VAULT OVERVIEW</h2>
        <div className="asset-grid">
          {vaultAssets.map((asset) => (
            <div key={asset._id} className="asset-card">
              {/* USE THE CLOUDINARY URL FROM MONGODB */}
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
        <div className="sequence-grid">
          {sequence.map((asset, index) => (
            <div key={index} className="sequence-item">
              <img src={asset.file_url} style={{ height: '50px' }} />
              <button onClick={() => removeFromSequence(index)}>X</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
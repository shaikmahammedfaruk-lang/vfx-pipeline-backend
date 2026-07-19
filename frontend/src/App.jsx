import { useState, useEffect } from 'react'
import './App.css'

const API_BASE_URL = 'https://vfx-pipeline-backend.onrender.com'

function App() {
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [file, setFile] = useState(null)
  const [message, setMessage] = useState('')
  const [vaultAssets, setVaultAssets] = useState([])
  const [searchTerm, setSearchTerm] = useState('') 
  const [activeFilters, setActiveFilters] = useState([])
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

  // --- CRUD OPERATIONS ---
  const deleteAsset = async (id) => {
    await fetch(`${API_BASE_URL}/api/assets/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const updateAsset = async (id, newTitle, newTags) => {
    await fetch(`${API_BASE_URL}/api/assets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, tags: newTags })
    });
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
      if(data.status === 'Success') setMessage(`Render Complete! View: ${API_BASE_URL}${data.url}`);
      else setMessage(`Render failed: ${data.message}`);
    } catch (err) { setMessage("Render failed."); }
  };

  // --- UI HELPERS ---
  const uniqueTags = [...new Set(vaultAssets.flatMap(a => a.technical_tags || []))];
  const toggleFilter = (tag) => setActiveFilters(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  const addToSequence = (asset) => setSequence([...sequence, asset]);
  const removeFromSequence = (index) => setSequence(sequence.filter((_, i) => i !== index));
  const moveInSequence = (index, direction) => {
    const newSequence = [...sequence];
    const targetIndex = index + direction;
    if (targetIndex >= 0 && targetIndex < newSequence.length) {
      [newSequence[index], newSequence[targetIndex]] = [newSequence[targetIndex], newSequence[index]];
      setSequence(newSequence);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file) return;
    setLoading(true); setMessage("Processing...");
    const formData = new FormData(); formData.append('file', file);
    try {
      await fetch(`${API_BASE_URL}/api/upload-asset?title=${encodeURIComponent(title)}&tags=${encodeURIComponent(tags)}`, {
        method: 'POST', body: formData
      });
      setTitle(''); setTags(''); setFile(null); fetchData();
      setMessage("Asset uploaded!");
    } catch (error) { setMessage('Upload failed.') } finally { setLoading(false) }
  }

  const filteredAssets = vaultAssets.filter(asset => {
    const searchLower = searchTerm.toLowerCase();
    const titleMatch = (asset.asset_title || "").toLowerCase().includes(searchLower);
    const tagMatch = (asset.technical_tags || []).some(tag => tag.toLowerCase().includes(searchLower));
    const filterMatch = activeFilters.length === 0 || activeFilters.every(f => asset.technical_tags?.includes(f));
    return (titleMatch || tagMatch) && filterMatch;
  });

  const isVideo = (filename) => filename && filename.toLowerCase().match(/\.(mp4|webm|mov|ogg)$/);

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
          {filteredAssets.map((asset) => (
            <div key={asset._id} className="asset-card">
              {isVideo(asset.file_name) ? <video src={`${API_BASE_URL}/media/${asset.file_name}`} controls className="asset-thumbnail" /> : <img src={`${API_BASE_URL}/media/${asset.file_name}`} className="asset-thumbnail" />}
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
              <img src={`${API_BASE_URL}/media/${asset.thumbnail_file}`} />
              <button onClick={() => removeFromSequence(index)}>X</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
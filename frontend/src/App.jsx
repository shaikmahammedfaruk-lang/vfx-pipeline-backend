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

  // Improved Fetching with Logging
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
      setMessage("Error: Could not connect to the backend.");
    }
  }

  useEffect(() => { fetchData() }, [])

  // Auto-save sequence with better error handling
  useEffect(() => {
    if (sequence.length > 0) {
      fetch(`${API_BASE_URL}/api/sequence/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence })
      }).catch(err => console.error("Auto-save failed", err));
    }
  }, [sequence]);

  const renderTrailer = async () => {
    if (sequence.length === 0) {
      setMessage("Sequence is empty. Add assets first!");
      return;
    }
    setMessage("Rendering final trailer... please wait (this may take a minute).");
    try {
      const response = await fetch(`${API_BASE_URL}/api/render-trailer`, { method: 'POST' });
      const data = await response.json();
      
      if(data.status === 'Success') {
        setMessage(`Render Complete! View: ${API_BASE_URL}${data.url}`);
      } else {
        setMessage(`Render failed: ${data.message || 'Unknown server error'}`);
      }
    } catch (err) { 
      setMessage("Render failed: Server connection lost."); 
    }
  };

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
      setMessage("Asset uploaded successfully!");
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
          <input type="text" placeholder="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} required />
          <input type="file" onChange={(e) => setFile(e.target.files[0])} required />
          <button type="submit" disabled={loading}>{loading ? "Processing..." : "Process & Upload"}</button>
        </form>
        {message && <div className="status-box">{message}</div>}
      </div>

      <div className="header">
        <h3>Welcome back, VFX Lead. Project Echoes of Eternity is active.</h3>
      </div>

      <div className="vault-section">
        <h2>ASSET VAULT OVERVIEW</h2>
        <input type="text" placeholder="🔍 Search assets..." className="search-bar" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <div className="filter-bar" style={{ marginBottom: '15px' }}>
          {uniqueTags.map(tag => (
            <button key={tag} className={activeFilters.includes(tag) ? 'filter-btn active' : 'filter-btn'} onClick={() => toggleFilter(tag)}>{tag}</button>
          ))}
        </div>
        <div className="asset-grid">
          {filteredAssets.map((asset) => (
            <div key={asset._id} className="asset-card">
              {isVideo(asset.file_name) ? <video src={`${API_BASE_URL}/media/${asset.file_name}`} controls className="asset-thumbnail" /> : <img src={`${API_BASE_URL}/media/${asset.file_name}`} className="asset-thumbnail" />}
              <div className="asset-title">{asset.asset_title}</div>
              <button onClick={() => addToSequence(asset)}>+ Add to Trailer</button>
            </div>
          ))}
        </div>
      </div>

      <div className="status-panel">
        <h3>SYSTEM STATUS</h3>
        <div style={{ background: '#0f1115', padding: '10px', borderRadius: '5px', marginBottom: '20px' }}>
          <p>🚀 FastAPI: <span style={{ color: '#34d399' }}>{systemStatus.api}</span></p>
          <p>🗄️ MongoDB: <span style={{ color: '#34d399' }}>{systemStatus.mongodb}</span></p>
        </div>

        <div className="trailer-sequence-box">
          <h4>🎬 Trailer Sequence</h4>
          <button onClick={renderTrailer} style={{ width: '100%', background: '#059669', padding: '10px', cursor: 'pointer', border: 'none', color: 'white', borderRadius: '5px', marginBottom: '10px' }}>🚀 Render Final Trailer</button>
          <div className="sequence-grid">
            {sequence.map((asset, index) => (
              <div key={index} className="sequence-item">
                <img src={`${API_BASE_URL}/media/${asset.thumbnail_file}`} style={{ width: '100%', height: '60px', objectFit: 'cover' }} />
                <p style={{ fontSize: '0.75rem' }}>{asset.asset_title}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
                  <button onClick={() => moveInSequence(index, -1)} disabled={index === 0}>←</button>
                  <button onClick={() => removeFromSequence(index)}>X</button>
                  <button onClick={() => moveInSequence(index, 1)} disabled={index === sequence.length - 1}>→</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
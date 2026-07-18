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
  const [loading, setLoading] = useState(false)
  const [sequence, setSequence] = useState([]) // NEW: Trailer sequence state

  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editTags, setEditTags] = useState('')

  const fetchAssets = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/assets`);
      const data = await response.json();
      setVaultAssets(Array.isArray(data.assets) ? data.assets : []);
    } catch (error) {
      console.error("Could not fetch assets", error);
    }
  }

  useEffect(() => {
    fetchAssets()
  }, [])

  // NEW: Sequence Helpers
  const addToSequence = (asset) => setSequence([...sequence, asset]);
  const removeFromSequence = (index) => setSequence(sequence.filter((_, i) => i !== index));

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file) return;

    setLoading(true)
    setMessage("Processing asset...")

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch(`${API_BASE_URL}/api/upload-asset?title=${encodeURIComponent(title)}&tags=${encodeURIComponent(tags)}`, {
        method: 'POST',
        body: formData
      })
      const data = await response.json()
      setMessage(`Success: ${data.message}`)
      setTitle(''); setTags(''); setFile(null);
      fetchAssets() 
    } catch (error) {
      setMessage('Upload failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (assetId) => {
    await fetch(`${API_BASE_URL}/api/assets/${assetId}`, { method: 'DELETE' });
    fetchAssets();
  }

  const startEditing = (asset) => {
    setEditingId(asset._id);
    setEditTitle(asset.asset_title);
    setEditTags(asset.technical_tags ? asset.technical_tags.join(', ') : '');
  }

  const handleUpdate = async (assetId) => {
    await fetch(`${API_BASE_URL}/api/assets/${assetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle, tags: editTags })
    });
    setEditingId(null);
    fetchAssets();
  }

  const filteredAssets = vaultAssets.filter(asset => {
    const searchLower = searchTerm.toLowerCase();
    const titleMatch = (asset.asset_title || "").toLowerCase().includes(searchLower);
    const tagMatch = (asset.technical_tags || []).some(tag => tag.toLowerCase().includes(searchLower));
    return titleMatch || tagMatch;
  });

  const isVideo = (filename) => filename && filename.toLowerCase().match(/\.(mp4|webm|mov|ogg)$/);

  return (
    <div className="dashboard-layout">
      <div className="upload-section">
        <h1>VFX PIPELINE</h1>
        <form onSubmit={handleUpload} className="upload-form">
          <input type="text" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <input type="text" placeholder="Tags (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} required />
          <input type="file" onChange={(e) => setFile(e.target.files[0])} required />
          <button type="submit" disabled={loading}>{loading ? "Processing..." : "Process & Upload"}</button>
        </form>
        {message && <div className="status-box">{message}</div>}
      </div>

      <div className="vault-section">
        <h2>ASSET VAULT OVERVIEW</h2>
        <input type="text" placeholder="🔍 Search assets..." className="search-bar" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        
        <div className="asset-grid">
          {filteredAssets.map((asset) => (
            <div key={asset._id} className="asset-card">
              {isVideo(asset.file_name) ? (
                <video src={`${API_BASE_URL}/media/${asset.file_name}`} controls className="asset-thumbnail" />
              ) : (
                <img src={`${API_BASE_URL}/media/${asset.file_name}`} alt="Preview" className="asset-thumbnail" />
              )}
              
              {editingId === asset._id ? (
                <div className="edit-form">
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  <input value={editTags} onChange={(e) => setEditTags(e.target.value)} />
                  <button onClick={() => handleUpdate(asset._id)}>Save</button>
                </div>
              ) : (
                <>
                  <div className="asset-title">{asset.asset_title}</div>
                  <button onClick={() => addToSequence(asset)}>+ Add to Trailer</button>
                  <button onClick={() => startEditing(asset)}>Edit</button>
                  <button onClick={() => handleDelete(asset._id)}>Delete</button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* NEW: Trailer Sequence Box */}
        <div className="trailer-sequence-box" style={{ marginTop: '40px', padding: '20px', border: '1px solid #444' }}>
          <h3>🎬 Echoes of Eternity - Trailer Sequence</h3>
          <div className="sequence-grid" style={{ display: 'flex', gap: '10px', overflowX: 'auto' }}>
            {sequence.map((asset, index) => (
              <div key={index} style={{ background: '#222', padding: '10px', borderRadius: '5px' }}>
                <p>{asset.asset_title}</p>
                <button onClick={() => removeFromSequence(index)}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [file, setFile] = useState(null)
  const [message, setMessage] = useState('')
  const [vaultAssets, setVaultAssets] = useState([])
  const [searchTerm, setSearchTerm] = useState('') 

  // Memory for the edit mode
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editTags, setEditTags] = useState('')

  const fetchAssets = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/assets')
      const data = await response.json()
      setVaultAssets(data.assets || [])
    } catch (error) {
      console.error("Could not fetch assets", error)
    }
  }

  useEffect(() => {
    fetchAssets()
  }, [])

  const handleUpload = async (e) => {
    e.preventDefault()
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch(`http://localhost:8000/api/upload-asset?title=${title}&tags=${tags}`, {
        method: 'POST',
        body: formData
      })
      const data = await response.json()
      setMessage(`Success: ${data.message}`)
      fetchAssets() 
    } catch (error) {
      setMessage('Upload failed. Is the backend running?')
    }
  }

  const handleDelete = async (assetId) => {
    try {
      await fetch(`http://localhost:8000/api/assets/${assetId}`, { method: 'DELETE' })
      fetchAssets()
    } catch (error) {
      console.error("Could not delete asset", error)
    }
  }

  // Start editing a specific card
  const startEditing = (asset) => {
    setEditingId(asset._id)
    setEditTitle(asset.asset_title)
    setEditTags(asset.technical_tags.join(', '))
  }

  // Save the updated text to Python and MongoDB
  const handleUpdate = async (assetId) => {
    try {
      await fetch(`http://localhost:8000/api/assets/${assetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, tags: editTags })
      })
      setEditingId(null) // Turn off edit mode
      fetchAssets() // Refresh the gallery
    } catch (error) {
      console.error("Could not update asset", error)
    }
  }

  const filteredAssets = vaultAssets.filter(asset => {
    const searchLower = searchTerm.toLowerCase()
    const titleMatch = asset.asset_title.toLowerCase().includes(searchLower)
    const tagMatch = asset.technical_tags.some(tag => tag.toLowerCase().includes(searchLower))
    return titleMatch || tagMatch
  })

  const isVideo = (filename) => {
    if (!filename) return false;
    return filename.toLowerCase().match(/\.(mp4|webm|mov|ogg)$/);
  }

  return (
    <div className="dashboard-layout">
      {/* LEFT SIDE: UPLOAD FORM */}
      <div className="upload-section">
        <h1>VFX PIPELINE</h1>
        <p className="subtitle">Upload high-resolution assets directly to MongoDB.</p>
        
        <form onSubmit={handleUpload} className="upload-form">
          <input 
            type="text" 
            placeholder="Asset Title (e.g. Echoes_of_Eternity_Teaser)" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)} 
            required 
          />
          <input 
            type="text" 
            placeholder="Technical Tags (e.g. 8K CGI, God Rays)" 
            value={tags} 
            onChange={(e) => setTags(e.target.value)} 
            required 
          />
          <input 
            type="file" 
            onChange={(e) => setFile(e.target.files[0])} 
            required 
            className="file-input"
          />
          <button type="submit">Process & Upload to Vault</button>
        </form>
        {message && <div className="status-box">{message}</div>}
      </div>

      {/* RIGHT SIDE: ASSET VAULT GALLERY */}
      <div className="vault-section">
        <h2>ASSET VAULT OVERVIEW</h2>
        
        <input 
          type="text" 
          placeholder="🔍 Search assets by title or technical tags..." 
          className="search-bar"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <div className="asset-grid">
          {filteredAssets.map((asset) => (
            <div key={asset._id} className="asset-card">
              
              {/* UPDATED: Smart detector using the lightweight thumbnail */}
              {isVideo(asset.file_name) ? (
                <video 
                  src={`http://localhost:8000/media/${asset.file_name}`} 
                  poster={asset.thumbnail_file ? `http://localhost:8000/media/${asset.thumbnail_file}` : ''}
                  preload="none"
                  controls 
                  className="asset-thumbnail" 
                />
              ) : (
                <img 
                  src={`http://localhost:8000/media/${asset.file_name}`} 
                  alt="Asset Preview" 
                  className="asset-thumbnail" 
                />
              )}
              
              {/* The Edit Toggle Logic */}
              {editingId === asset._id ? (
                <div className="edit-form">
                  <input 
                    type="text" 
                    value={editTitle} 
                    onChange={(e) => setEditTitle(e.target.value)} 
                    className="edit-input"
                  />
                  <input 
                    type="text" 
                    value={editTags} 
                    onChange={(e) => setEditTags(e.target.value)} 
                    className="edit-input"
                  />
                  <div className="card-actions">
                    <button onClick={() => handleUpdate(asset._id)} className="save-btn">Save</button>
                    <button onClick={() => setEditingId(null)} className="cancel-btn">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="asset-title">{asset.asset_title}</div>
                  <div className="asset-tags">
                    {asset.technical_tags.map(tag => (
                      <span key={tag} className="tag">{tag}</span>
                    ))}
                  </div>
                  <div className="card-actions">
                    <button onClick={() => startEditing(asset)} className="edit-btn">Edit</button>
                    <button onClick={() => handleDelete(asset._id)} className="delete-btn">Delete</button>
                  </div>
                </>
              )}
              
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
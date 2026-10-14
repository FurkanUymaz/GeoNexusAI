import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Menu, FileText, UploadCloud, Folder, Hexagon, Loader2, ChevronRight } from 'lucide-react'

const API_BASE = "http://127.0.0.1:8000"

const Sidebar = ({ isOpen, toggleSidebar, onPdfSelect, activePdf, onTopicSelect }) => {
  const fileInputRef = useRef(null)

  const [documents, setDocuments] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const [hoveredDocId, setHoveredDocId] = useState(null)
  const [flyoutData, setFlyoutData] = useState({})
  const [loadingFlyoutId, setLoadingFlyoutId] = useState(null)
  const [loadingTopicId, setLoadingTopicId] = useState(null)

  // Portal menünün ekran koordinatlarını tutmak için
  const [flyoutPos, setFlyoutPos] = useState({ top: 0, left: 0 })
  const timeoutRef = useRef(null)

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_BASE}/documents`)
      const data = await response.json()
      setDocuments(data)
    } catch (error) {
      console.error("Belge listesi alınamadı:", error)
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [])

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setIsUploading(true)
    const formData = new FormData()
    formData.append("file", file)

    try {
      const response = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData
      })

      if (!response.ok) {
        throw new Error("Sunucu hatası")
      }

      await fetchDocuments()
      onPdfSelect(file.name)

    } catch (error) {
      console.error("Yükleme hatası:", error)
    } finally {
      setIsUploading(false)
      e.target.value = null
    }
  }

  const loadFlyoutData = async (doc) => {
    if (flyoutData[doc.id] || loadingFlyoutId === doc.id) return

    setLoadingFlyoutId(doc.id)
    try {
      const chaptersResponse = await fetch(`${API_BASE}/documents/${doc.id}/chapters`)
      const chapters = await chaptersResponse.json()

      const chaptersWithTopics = await Promise.all(
        chapters.map(async (chapter) => {
          const topicsResponse = await fetch(`${API_BASE}/chapters/${chapter.id}/topics`)
          const topics = await topicsResponse.json()
          return { ...chapter, topics }
        })
      )

      setFlyoutData(prev => ({ ...prev, [doc.id]: chaptersWithTopics }))
    } catch (error) {
      console.error("Bölüm/konu listesi alınamadı:", error)
    } finally {
      setLoadingFlyoutId(null)
    }
  }

  // Fare belgenin üzerine geldiğinde
  const handleDocHover = (e, doc) => {
    clearTimeout(timeoutRef.current) // Varsa kapanmayı iptal et
    const rect = e.currentTarget.getBoundingClientRect()
    // Menünün çıkacağı koordinatı belirliyoruz
    setFlyoutPos({ top: rect.top, left: rect.right + 5 }) 
    setHoveredDocId(doc.id)
    loadFlyoutData(doc)
  }

  // Fare belgeden veya menüden ayrıldığında (hemen kapanmasın diye kısa bir süre tanıyoruz)
  const handleDocLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setHoveredDocId(null)
    }, 250)
  }

  const handleTopicClick = async (topic) => {
    setLoadingTopicId(topic.id)
    try {
      const response = await fetch(`${API_BASE}/topics/${topic.id}/content`)
      const data = await response.json()
      onTopicSelect({
        id: topic.id,
        title: topic.title,
        text: data.lecture_text,
        timestamp: Date.now()
      })
    } catch (error) {
      console.error("Konu içeriği alınamadı:", error)
    } finally {
      setLoadingTopicId(null)
      setHoveredDocId(null)
    }
  }

  // Portal render fonksiyonu: Sidebar'ın dışına (body'ye) render eder
  const renderFlyoutPortal = () => {
    if (!hoveredDocId) return null

    return createPortal(
      <div 
        className="topic-flyout" 
        style={{
          position: 'fixed',
          top: flyoutPos.top,
          left: flyoutPos.left,
          zIndex: 999999,
          // Kendi CSS'inizdeki topic-flyout stillerini korur
        }}
        onMouseEnter={() => clearTimeout(timeoutRef.current)} // Fare menüdeyken açık tut
        onMouseLeave={handleDocLeave}
      >
        {loadingFlyoutId === hoveredDocId && (
          <div className="flyout-loading">
            <Loader2 size={16} className="animate-spin" />
            <span>Yükleniyor...</span>
          </div>
        )}

        {flyoutData[hoveredDocId]?.map((chapter) => (
          <div key={chapter.id} className="flyout-chapter">
            <div className="flyout-chapter-title">{chapter.title}</div>
            {chapter.topics.map((topic) => (
              <div
                key={topic.id}
                className="flyout-topic"
                onClick={() => handleTopicClick(topic)}
              >
                {loadingTopicId === topic.id ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <span className="flyout-topic-dot" />
                )}
                <span>{topic.title}</span>
              </div>
            ))}
          </div>
        ))}
      </div>,
      document.body
    )
  }

  return (
    <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
      <div className="sidebar-header">
        {isOpen ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <img 
              src="/geonexus-logo.png" 
              alt="GeoNexus Logo" 
              style={{ width: '32px', height: '32px', objectFit: 'contain' }} 
            />
              <span className="brand-title">GeoNexus</span>
            </div>
            <button onClick={toggleSidebar} className="icon-btn">
              <Menu size={24} />
            </button>
          </>
        ) : (
          <button onClick={toggleSidebar} className="icon-btn">
            <img 
              src="/geonexus-logo.png" 
              alt="GeoNexus Logo" 
              style={{ width: '32px', height: '32px', objectFit: 'contain' }} 
            />
          </button>
        )}
      </div>

      <div className="sidebar-content">
        {isOpen ? (
          <div className="course-group">
            <h3>Belgeler</h3>
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="pdf-item-wrapper"
                onMouseEnter={(e) => handleDocHover(e, doc)}
                onMouseLeave={handleDocLeave}
              >
                <div
                  className={`pdf-item ${activePdf === doc.filename ? 'active' : ''}`}
                  onClick={() => onPdfSelect(doc.filename)}
                >
                  <FileText size={18} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {doc.filename}
                  </span>
                  <ChevronRight size={14} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="icon-btn" title="Belgeler">
            <Folder size={20} />
          </div>
        )}
      </div>

      <div className="student-area">
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".pdf"
          onChange={handleFileUpload}
        />

        {isOpen ? (
          <button
            className="upload-btn"
            onClick={() => fileInputRef.current.click()}
            disabled={isUploading}
            style={{ opacity: isUploading ? 0.7 : 1 }}
          >
            {isUploading ? <Loader2 size={20} className="animate-spin" /> : <UploadCloud size={20} />}
            <span>{isUploading ? 'İşleniyor...' : 'PDF Yükle'}</span>
          </button>
        ) : (
          <button
            className="icon-btn upload-btn"
            style={{ padding: '0.5rem', opacity: isUploading ? 0.7 : 1 }}
            onClick={() => fileInputRef.current.click()}
            disabled={isUploading}
          >
            {isUploading ? <Loader2 size={20} className="animate-spin" /> : <UploadCloud size={20} />}
          </button>
        )}
      </div>

      {/* Flyout menüsünü ekranın en üst katmanında render et */}
      {renderFlyoutPortal()}
    </div>
  )
}

export default Sidebar
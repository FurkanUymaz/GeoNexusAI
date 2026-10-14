import { useState, useRef, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ChatArea from './components/ChatArea'
import PdfViewer from './components/PdfViewer'

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [activePdf, setActivePdf] = useState(null)
  const [pdfWidth, setPdfWidth] = useState(50)
  const [pendingTopicMessage, setPendingTopicMessage] = useState(null)
  const isDragging = useRef(false)

  const startDrag = () => {
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
  }

  const onDrag = (e) => {
    if (!isDragging.current) return
    const newPdfWidth = 100 - (e.clientX / window.innerWidth) * 100
    if (newPdfWidth > 20 && newPdfWidth < 80) {
      setPdfWidth(newPdfWidth)
    }
  }

  const stopDrag = () => {
    isDragging.current = false
    document.body.style.cursor = 'default'
  }

  useEffect(() => {
    window.addEventListener('mousemove', onDrag)
    window.addEventListener('mouseup', stopDrag)
    return () => {
      window.removeEventListener('mousemove', onDrag)
      window.removeEventListener('mouseup', stopDrag)
    }
  }, [])

  return (
    <div className="app-container" style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      
      <Sidebar
        isOpen={isSidebarOpen}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onPdfSelect={(pdfName) => setActivePdf(pdfName)}
        activePdf={activePdf}
        onTopicSelect={(topicData) => setPendingTopicMessage(topicData)}
      />
      
      <main className="main-content" style={{ display: 'flex', flex: 1, position: 'relative', height: '100vh' }}>
        
        <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ChatArea activePdf={activePdf} pendingTopicMessage={pendingTopicMessage} />
        </div>
        
        {activePdf && (
          <>
            <div
              onMouseDown={startDrag}
              style={{
                width: '4px',
                cursor: 'col-resize',
                backgroundColor: '#374151',
                zIndex: 10,
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#3b82f6'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#374151'}
            />
            
            <div style={{ width: `${pdfWidth}%`, backgroundColor: '#1f2937', height: '100%' }}>
              <PdfViewer
                activePdf={activePdf}
                onClose={() => setActivePdf(null)}
              />
            </div>
          </>
        )}
        
      </main>
    </div>
  )
}

export default App
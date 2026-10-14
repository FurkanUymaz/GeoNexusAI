import { X } from 'lucide-react'

const PdfViewer = ({ activePdf, onClose }) => {
  if (!activePdf) return null

  const pdfUrl = `http://127.0.0.1:8000/uploads/${activePdf}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#111827' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '12px 16px',
        backgroundColor: '#1f2937',
        borderBottom: '1px solid #374151',
        color: '#f3f4f6'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
          <span style={{ backgroundColor: '#2563eb', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
            PDF
          </span>
          <h2 style={{ fontSize: '14px', margin: 0, fontWeight: '500', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {activePdf}
          </h2>
        </div>
        
        <button 
          onClick={onClose} 
          style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#374151'; e.currentTarget.style.color = '#f87171' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
        >
          <X size={18} />
        </button>
      </div>
      
      <div style={{ flex: 1, width: '100%', height: '100%' }}>
        <iframe 
          src={pdfUrl} 
          width="100%" 
          height="100%" 
          title={activePdf}
          style={{ border: 'none', display: 'block' }}
        />
      </div>
    </div>
  )
}

export default PdfViewer
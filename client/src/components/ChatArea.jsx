import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import remarkGfm from 'remark-gfm'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { 
  ArrowUpIcon, 
  Paperclip, 
  AlignLeft, 
  FileText, 
  HelpCircle, 
  Orbit, 
  Calculator, 
  X,
  Globe // YENİ: PPP Modülü için eklendi
} from 'lucide-react'
import KeplerModule from './KeplerModule'
import LevelingModule from './LevelingModule'
import PPPModule from './PPPModule' // YENİ: PPP Modülü eklendi

// =========================================================================
// KAPANIRKEN DE ANİMASYON YAPAN, SİDEBARI AŞAN TAM EKRAN MODAL BİLEŞENİ
// =========================================================================
const FullScreenModal = ({ isOpen, onClose, title, icon: Icon, children }) => {
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      // DOM'a eklendikten sonra pürüzsüz açılış animasyonunu tetikle
      setTimeout(() => setIsVisible(true), 10);
    } else {
      setIsVisible(false);
      // Kapanış animasyonunun (0.4s) bitmesini bekle, ardından bileşeni kaldır
      const timer = setTimeout(() => setIsRendered(false), 400);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isRendered) return null;

  // Portal sayesinde bileşen hapsolduğu yerden çıkıp doğrudan body'e yapışır
  return createPortal(
    <div className={`modal-overlay ${isVisible ? 'show' : ''}`}>
      <div className={`modal-content ${isVisible ? 'show' : ''}`}>
        
        <div className="modal-header">
          <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Icon color="#a78bfa" size={24} /> 
            {title}
          </span>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={26} />
          </button>
        </div>

        <div className="modal-body">
          {children}
        </div>

      </div>
    </div>,
    document.body
  );
};


// =========================================================================
// ANA CHAT ALANI BİLEŞENİ
// =========================================================================
const ChatArea = ({ isPdfOpen, width, isDragging, pendingTopicMessage }) => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'ai',
      text: 'Merhaba Geomatik Mühendisi! Sol taraftan analiz etmek istediğin bir PDF seç veya aşağıdaki modüllerden birini başlat.',
      module: null
    }
  ])
  const [inputValue, setInputValue] = useState('')
  const [selectedModule, setSelectedModule] = useState(null)
  const [isTyping, setIsTyping] = useState(false)
  
  const messagesEndRef = useRef(null)
  const chatHistoryRef = useRef(null)
  const textareaRef = useRef(null)
  const isAtBottomRef = useRef(true)
  const lastTopicTimestampRef = useRef(null)

  useEffect(() => {
    if (!pendingTopicMessage) return
    if (lastTopicTimestampRef.current === pendingTopicMessage.timestamp) return
    lastTopicTimestampRef.current = pendingTopicMessage.timestamp

    const userMessage = {
      id: Date.now(),
      sender: 'user',
      text: `Konu: ${pendingTopicMessage.title}`,
      module: null
    }

    const topicAiMessage = {
      id: Date.now() + 1,
      sender: 'ai',
      text: pendingTopicMessage.text,
      module: null
    }

    isAtBottomRef.current = true
    setMessages(prev => [...prev, userMessage, topicAiMessage])
  }, [pendingTopicMessage])

  const scrollToBottom = (force = false) => {
    if (force || isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleScroll = () => {
    const el = chatHistoryRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isAtBottomRef.current = distanceFromBottom < 80
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '60px'
    const scrollHeight = el.scrollHeight
    el.style.height = Math.min(scrollHeight, 200) + 'px'
  }, [inputValue])

  const handleSendMessage = async () => {
    if (inputValue.trim() === '' && !selectedModule) return

    const messageText = inputValue || `Lütfen bu PDF için şu modülü çalıştır: ${selectedModule}`

    const newUserMessage = {
      id: Date.now(),
      sender: 'user',
      text: messageText,
      module: selectedModule
    }

    isAtBottomRef.current = true
    setMessages(prev => [...prev, newUserMessage])
    setInputValue('')
    setSelectedModule(null)
    setIsTyping(true)

    try {
      const response = await fetch("http://127.0.0.1:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText })
      })

      const data = await response.json()

      const newAiMessage = {
        id: Date.now() + 1,
        sender: 'ai',
        text: data.answer,
        module: null
      }
      isAtBottomRef.current = true
      setMessages(prev => [...prev, newAiMessage])

    } catch (error) {
      console.error("Chat hatası:", error)
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'ai',
        text: "Bağlantı hatası: Python sunucusuna ulaşılamıyor.",
        module: null
      }])
    } finally {
      setIsTyping(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleModuleSelect = (moduleName) => setSelectedModule(moduleName)

  const [isKeplerOpen, setIsKeplerOpen] = useState(false)
  const [isLevelingOpen, setIsLevelingOpen] = useState(false)
  const [isPPPOpen, setIsPPPOpen] = useState(false) // YENİ: PPP Modülü state'i

  const handleKeplerModule = () => setIsKeplerOpen(true)
  const handleLevelingModule = () => setIsLevelingOpen(true)
  const handlePPPModule = () => setIsPPPOpen(true) // YENİ: PPP Modülü tetikleyicisi

  const handleLevelingComplete = (reportText) => {
    setIsLevelingOpen(false)
    setMessages(prev => [...prev, {
      id: Date.now(),
      sender: 'ai',
      text: reportText,
      module: 'Nivelman Raporu'
    }])
  }

  // YENİ: PPP Modülü tamamlanma handler'ı
  const handlePPPComplete = (reportText) => {
    setIsPPPOpen(false)
    setMessages(prev => [...prev, {
      id: Date.now(),
      sender: 'ai',
      text: reportText,
      module: 'GNSS PPP Raporu'
    }])
  }

  const isChatEmpty = messages.length <= 1;
  const inputSectionBackground = isChatEmpty ? 'transparent' : 'linear-gradient(to top, rgba(5,5,5,1) 30%, transparent)';

  return (
    <div
      className={`cyber-container ${isDragging ? 'dragging' : ''}`}
      style={{ 
        width: isPdfOpen ? `${width}%` : '100%' 
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        /* ----------------------------------------------------
           ÖZEL KAYDIRMA ÇUBUĞU (SCROLLBAR) STİLLERİ
           ---------------------------------------------------- */
        ::-webkit-scrollbar { 
          width: 8px; 
          height: 8px; 
        }
        
        ::-webkit-scrollbar-track { 
          background: rgba(255, 255, 255, 0.02); 
          border-radius: 8px; 
          margin: 4px; 
        }
        
        ::-webkit-scrollbar-thumb { 
          background: rgba(255, 255, 255, 0.15); 
          border-radius: 8px; 
          transition: background 0.3s ease; 
        }
        
        ::-webkit-scrollbar-thumb:hover { 
          background: rgba(167, 139, 250, 0.6); 
        }
        
        * { 
          scrollbar-width: thin; 
          scrollbar-color: rgba(255, 255, 255, 0.15) transparent; 
        }

        /* ----------------------------------------------------
           GENEL ARKA PLAN VE SİDEBAR AYARLARI
           ---------------------------------------------------- */
        body, html, #root, .App {
          background-color: #050505 !important; 
          margin: 0; 
          padding: 0;
        }

        aside, [class*="sidebar"], [class*="Sidebar"], .sidebar-container {
          background-color: rgba(5, 5, 5, 0.4) !important;
          backdrop-filter: blur(24px) !important;
          -webkit-backdrop-filter: blur(24px) !important;
          border-right: 1px solid rgba(255, 255, 255, 0.05) !important;
          z-index: 20;
        }

        /* ----------------------------------------------------
           HAREKETLİ ARKA PLAN KÜRELERİ
           ---------------------------------------------------- */
        .bg-orbs {
          position: fixed; 
          top: 0; 
          left: 0; 
          width: 100vw; 
          height: 100vh;
          overflow: hidden; 
          pointer-events: none; 
          z-index: 1; 
        }
        
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          animation: pulseOrb 8s infinite alternate ease-in-out;
        }
        
        .orb-1 { 
          width: 450px; 
          height: 450px; 
          background: rgba(139, 92, 246, 0.15); 
          top: -10%; 
          left: 10%; 
        }
        
        .orb-2 { 
          width: 500px; 
          height: 500px; 
          background: rgba(99, 102, 241, 0.12); 
          bottom: -10%; 
          right: 10%; 
          animation-delay: 2s; 
        }
        
        .orb-3 { 
          width: 350px; 
          height: 350px; 
          background: rgba(217, 70, 239, 0.1); 
          top: 30%; 
          right: 40%; 
          animation-delay: 4s; 
        }

        @keyframes pulseOrb {
          0% { transform: scale(1) translate(0, 0); opacity: 0.5; }
          100% { transform: scale(1.1) translate(30px, 30px); opacity: 0.8; }
        }

        /* ----------------------------------------------------
           TAM EKRAN MODAL STİLLERİ (SİDEBAR AŞAN YAPIT)
           ---------------------------------------------------- */
        .modal-overlay { 
          position: fixed; 
          top: 0; 
          left: 0; 
          width: 100vw; 
          height: 100vh;
          background: rgba(0,0,0,0);
          backdrop-filter: blur(0px); 
          -webkit-backdrop-filter: blur(0px);
          display: flex; 
          align-items: center; 
          justify-content: center; 
          z-index: 999999; 
          padding: 2vh 2vw;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          pointer-events: none;
        }
        
        .modal-overlay.show {
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(20px); 
          -webkit-backdrop-filter: blur(20px);
          pointer-events: auto;
        }
        
        .modal-content { 
          background: #0a0a0a; 
          border: 1px solid rgba(255,255,255,0.1); 
          border-radius: 1.5rem; 
          width: 100%; 
          height: 100%; 
          max-width: 1800px; 
          max-height: 96vh; 
          display: flex; 
          flex-direction: column; 
          overflow: hidden; 
          box-shadow: 0 40px 80px rgba(0,0,0,0.9), 0 0 50px rgba(139, 92, 246, 0.15); 
          opacity: 0; 
          transform: scale(0.95) translateY(30px); 
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        .modal-content.show {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
        
        .modal-header { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          padding: 1.5rem 2rem; 
          border-bottom: 1px solid rgba(255,255,255,0.05); 
          color: white; 
          font-weight: 500; 
          font-size: 1.25rem;
        }
        
        .modal-body { 
          padding: 1.5rem; 
          overflow-y: auto; 
          overflow-x: hidden; 
          flex: 1; 
          display: flex; 
          flex-direction: column;
        }
        
        .modal-close-btn {
          background: rgba(255,255,255,0.05); 
          border: 1px solid rgba(255,255,255,0.1); 
          color: rgba(255,255,255,0.6); 
          cursor: pointer; 
          padding: 0.5rem; 
          border-radius: 50%;
          display: flex; 
          align-items: center; 
          justify-content: center; 
          transition: all 0.3s ease;
        }
        
        .modal-close-btn:hover { 
          color: white; 
          background: rgba(255,255,255,0.15); 
          transform: rotate(90deg); 
          border-color: rgba(167, 139, 250, 0.5);
        }

        /* ----------------------------------------------------
           CHAT EKRANI DÜZENİ
           ---------------------------------------------------- */
        .cyber-container {
          position: relative; 
          display: flex; 
          flex-direction: column; 
          height: 100vh;
          background: transparent; 
          color: white; 
          overflow: hidden; 
          transition: width 0.3s ease;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          z-index: 10;
        }
        
        .cyber-container.dragging { 
          opacity: 0.8; 
          pointer-events: none; 
        }
        
        .cyber-content { 
          position: relative; 
          display: flex; 
          flex-direction: column; 
          height: 100%; 
          width: 100%; 
        }

        .hero-section { 
          flex: 1; 
          display: flex; 
          flex-direction: column; 
          align-items: center; 
          justify-content: center; 
          animation: fadeUp 0.8s ease-out; 
        }
        
        .hero-title { 
          font-size: 2.5rem; 
          font-weight: 600; 
          background: linear-gradient(to right, rgba(255,255,255,1), rgba(255,255,255,0.5)); 
          -webkit-background-clip: text; 
          -webkit-text-fill-color: transparent; 
          margin-bottom: 0.75rem; 
        }
        
        .hero-subtitle { 
          color: rgba(255, 255, 255, 0.4); 
          font-size: 1.05rem; 
        }

        .chat-history { 
          flex: 1; 
          overflow-y: auto; 
          padding: 2rem; 
          display: flex; 
          flex-direction: column; 
          align-items: center; 
        }
        
        .messages-wrapper { 
          width: 100%; 
          max-width: 800px; 
          display: flex; 
          flex-direction: column; 
          gap: 1.5rem; 
        }

        .message-row { 
          display: flex; 
          flex-direction: column; 
          width: 100%; 
        }
        
        .message-row.user { 
          align-items: flex-end; 
        }
        
        .message-row.ai { 
          align-items: flex-start; 
        }
        
        .bubble { 
          max-width: 85%; 
          padding: 1.25rem 1.5rem; 
          border-radius: 1.25rem; 
          font-size: 0.95rem; 
          line-height: 1.6; 
        }
        
        .user .bubble { 
          background: rgba(255, 255, 255, 0.08); 
          backdrop-filter: blur(20px); 
          border: 1px solid rgba(255, 255, 255, 0.15); 
          color: white; 
          border-bottom-right-radius: 0.25rem; 
        }
        
        .ai .bubble { 
          background: transparent; 
          color: rgba(255, 255, 255, 0.9); 
        }

        .bubble table { 
          width: 100%; 
          border-collapse: collapse; 
          margin: 15px 0; 
          border-radius: 8px; 
          overflow: hidden; 
        }
        
        .bubble th, .bubble td { 
          border: 1px solid rgba(255, 255, 255, 0.1); 
          padding: 10px 14px; 
          text-align: center; 
        }
        
        .bubble th { 
          background-color: rgba(255, 255, 255, 0.05); 
          font-weight: 600; 
          color: #a78bfa; 
        }
        
        .bubble strong { 
          color: #fff; 
        }
        
        .bubble code { 
          background: rgba(255, 255, 255, 0.1); 
          padding: 0.2rem 0.4rem; 
          border-radius: 4px; 
          font-family: monospace; 
          color: #c4b5fd; 
        }

        .input-section { 
          width: 100%; 
          display: flex; 
          flex-direction: column; 
          align-items: center; 
          padding: 1.5rem 1.5rem 2rem 1.5rem; 
        }
        
        .input-wrapper { 
          width: 100%; 
          max-width: 750px; 
          display: flex; 
          flex-direction: column; 
          gap: 1.25rem; 
        }

        .selected-module { 
          align-self: flex-start; 
          display: flex; 
          align-items: center; 
          gap: 0.5rem; 
          background: rgba(255, 255, 255, 0.1); 
          padding: 0.35rem 1rem; 
          border-radius: 2rem; 
          font-size: 0.85rem; 
          color: rgba(255,255,255,0.9); 
          backdrop-filter: blur(10px); 
          border: 1px solid rgba(255,255,255,0.1); 
        }
        
        .selected-module button { 
          background: none; 
          border: none; 
          color: white; 
          cursor: pointer; 
          display: flex; 
          align-items: center; 
          padding: 0; 
        }

        .cyber-input-box { 
          background: rgba(255, 255, 255, 0.03); 
          backdrop-filter: blur(24px); 
          -webkit-backdrop-filter: blur(24px); 
          border: 1px solid rgba(255, 255, 255, 0.1); 
          border-radius: 1rem; 
          display: flex; 
          flex-direction: column; 
          overflow: hidden; 
          box-shadow: 0 10px 40px rgba(0,0,0,0.5); 
          transition: border-color 0.3s ease; 
        }
        
        .cyber-input-box:focus-within { 
          border-color: rgba(139, 92, 246, 0.5); 
        }
        
        .cyber-textarea { 
          background: transparent; 
          border: none; 
          color: white; 
          padding: 1.25rem 1.25rem 0.5rem 1.25rem; 
          font-size: 0.95rem; 
          resize: none; 
          outline: none; 
          min-height: 60px; 
          font-family: inherit; 
          line-height: 1.5; 
        }
        
        .cyber-textarea::placeholder { 
          color: rgba(255, 255, 255, 0.3); 
        }

        .cyber-input-footer { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          padding: 0.5rem 1rem 1rem 1rem; 
        }
        
        .cyber-icon-btn { 
          background: none; 
          border: none; 
          color: rgba(255,255,255,0.5); 
          cursor: pointer; 
          padding: 0.5rem; 
          border-radius: 0.5rem; 
          transition: all 0.2s; 
          display: flex; 
          justify-content: center; 
          align-items: center; 
        }
        
        .cyber-icon-btn:hover { 
          color: white; 
          background: rgba(255,255,255,0.1); 
        }
        
        .cyber-send-btn { 
          background: rgba(255, 255, 255, 0.1); 
          color: rgba(255, 255, 255, 0.5); 
          border: none; 
          padding: 0.6rem; 
          border-radius: 0.5rem; 
          cursor: not-allowed; 
          transition: all 0.3s; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
        }
        
        .cyber-send-btn.active { 
          background: white; 
          color: black; 
          cursor: pointer; 
          box-shadow: 0 0 15px rgba(255,255,255,0.3); 
        }
        
        .cyber-send-btn.active:hover { 
          transform: scale(1.05); 
        }

        .modules-grid { 
          display: flex; 
          flex-wrap: wrap; 
          gap: 0.8rem; 
          justify-content: center; 
          width: 100%; 
        }
        
        .module-btn { 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          gap: 0.5rem; 
          padding: 0.8rem 1.2rem; 
          background: rgba(255, 255, 255, 0.04); 
          border: 1px solid rgba(255, 255, 255, 0.08); 
          border-radius: 0.75rem; 
          color: rgba(255, 255, 255, 0.8); 
          font-size: 0.9rem; 
          font-weight: 500; 
          cursor: pointer; 
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
          backdrop-filter: blur(12px); 
          flex: 1 1 130px; 
          max-width: 180px; 
        }
        
        .module-btn:hover { 
          background: rgba(255, 255, 255, 0.1); 
          color: white; 
          border-color: rgba(167, 139, 250, 0.4); 
          transform: translateY(-3px); 
          box-shadow: 0 5px 15px rgba(0,0,0,0.3), 0 0 15px rgba(167, 139, 250, 0.15); 
        }

        .typing-indicator { 
          display: flex; 
          gap: 4px; 
          padding: 0.5rem 0; 
        }
        
        .typing-indicator span { 
          width: 6px; 
          height: 6px; 
          background: rgba(255,255,255,0.6); 
          border-radius: 50%; 
          animation: bounce 1.4s infinite ease-in-out both; 
        }
        
        .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
        .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
        
        @keyframes fadeUp { 
          from { opacity: 0; transform: translateY(20px); } 
          to { opacity: 1; transform: translateY(0); } 
        }
        
        @keyframes bounce { 
          0%, 80%, 100% { transform: scale(0); } 
          40% { transform: scale(1); } 
        }
      `}} />

      {/* Arka Plan Küreleri */}
      <div className="bg-orbs">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>

      <div className="cyber-content">
        
        {/* Karşılama Ekranı (Boş Chat) */}
        {isChatEmpty ? (
          <div className="hero-section">
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
              <img 
                src="/geonexus-logo.png" 
                alt="GeoNexus Logo" 
                style={{ 
                  width: '140px', 
                  height: '140px', 
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 0 30px rgba(139, 92, 246, 0.4))' 
                }} 
              />
            </div>
            <h1 className="hero-title">GeoNexus AI</h1>
            <p className="hero-subtitle">Geomatik analizlerinizi hızlandırın. Belge yükleyin, soru sorun veya komut girin.</p>
          </div>
        ) : (
          /* Sohbet Geçmişi */
          <div className="chat-history" ref={chatHistoryRef} onScroll={handleScroll}>
            <div className="messages-wrapper">
              {messages.map((msg) => (
                <div key={msg.id} className={`message-row ${msg.sender}`}>
                  {msg.module && <div style={{fontSize: '11px', color: '#a78bfa', marginBottom: '4px', marginLeft: '12px'}}>Modül: {msg.module}</div>}
                  <div className="bubble">
                    <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              
              {isTyping && (
                <div className="message-row ai">
                  <div className="bubble">
                    <div className="typing-indicator">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* ALT GİRDİ ALANI */}
        <div className="input-section" style={{ background: inputSectionBackground }}>
          <div className="input-wrapper">
            
            {selectedModule && (
              <div className="selected-module">
                <span>Aktif Modül: <strong>{selectedModule}</strong></span>
                <button onClick={() => setSelectedModule(null)}><X size={14} /></button>
              </div>
            )}

            <div className="cyber-input-box">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Bir soru sorun veya komut girin..."
                className="cyber-textarea"
              />
              <div className="cyber-input-footer">
                <button className="cyber-icon-btn" title="Dosya Ekle">
                  <Paperclip size={20} />
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() && !selectedModule}
                  className={`cyber-send-btn ${inputValue.trim() || selectedModule ? 'active' : ''}`}
                >
                  <ArrowUpIcon size={20} />
                </button>
              </div>
            </div>

            <div className="modules-grid">
              <button className="module-btn" onClick={() => handleModuleSelect('Kısa Özet')}>
                <AlignLeft size={18} /> Kısa Özet
              </button>
              <button className="module-btn" onClick={() => handleModuleSelect('Detaylı Özet')}>
                <FileText size={18} /> Detaylı Özet
              </button>
              <button className="module-btn" onClick={() => handleModuleSelect('Sınav Sorusu')}>
                <HelpCircle size={18} /> Sınav Sorusu
              </button>
              <button className="module-btn" onClick={handleKeplerModule}>
                <Orbit size={18} /> Kepler Elemanları
              </button>
              <button className="module-btn" onClick={handleLevelingModule}>
                <Calculator size={18} /> Nivelman Dağıtımı
              </button>
              {/* YENİ: GNSS PPP BUTONU BURAYA EKLENDİ */}
              <button className="module-btn" onClick={handlePPPModule}>
                <Globe size={18} /> GNSS PPP Dönüşüm
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* ANİMASYONLU VE TAM EKRAN KEPLER MODALI (PORTAL) */}
      <FullScreenModal 
        isOpen={isKeplerOpen} 
        onClose={() => setIsKeplerOpen(false)} 
        title="Kepler Elemanları" 
        icon={Orbit}
      >
        <KeplerModule />
      </FullScreenModal>

      {/* ANİMASYONLU VE TAM EKRAN NİVELMAN MODALI (PORTAL) */}
      <FullScreenModal 
        isOpen={isLevelingOpen} 
        onClose={() => setIsLevelingOpen(false)} 
        title="Geometrik Nivelman Hata Dağıtımı" 
        icon={Calculator}
      >
        <LevelingModule onComplete={handleLevelingComplete} />
      </FullScreenModal>

      {/* YENİ: ANİMASYONLU VE TAM EKRAN PPP MODALI (PORTAL) */}
      <FullScreenModal 
        isOpen={isPPPOpen} 
        onClose={() => setIsPPPOpen(false)} 
        title="GNSS Precise Point Positioning & TUREF Dönüşümü" 
        icon={Globe}
      >
        <PPPModule onComplete={handlePPPComplete} />
      </FullScreenModal>

    </div>
  )
}

export default ChatArea
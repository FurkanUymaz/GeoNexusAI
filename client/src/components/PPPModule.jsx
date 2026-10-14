import React, { useState, useRef } from 'react';
import { UploadCloud, RefreshCw, FastForward, CheckCircle, FileCheck, ArrowRight, FileText, X, MapPin, Target } from 'lucide-react';

const PPPModule = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  
  const [obsFile, setObsFile] = useState(null);
  const [navFiles, setNavFiles] = useState([]);
  const [sp3File, setSp3File] = useState(null);

  const [domValue, setDomValue] = useState(33);
  const [obsEpoch, setObsEpoch] = useState(2026.17);
  const [tx, setTx] = useState(-1.566);
  const [ty, setTy] = useState(-0.273);
  const [tz, setTz] = useState(-1.385);
  const [rx, setRx] = useState(0.0);
  const [ry, setRy] = useState(0.0);
  const [rz, setRz] = useState(0.0);
  const [scalePpm, setScalePpm] = useState(0.0);

  const obsInputRef = useRef(null);
  const navInputRef = useRef(null);
  const sp3InputRef = useRef(null);

  const [pipelineData, setPipelineData] = useState(null);

  const handleObsSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setObsFile(e.target.files[0]);
    }
    e.target.value = null;
  };

  const handleNavSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setNavFiles(prev => [...prev, ...Array.from(e.target.files)]);
    }
    e.target.value = null;
  };

  const handleSp3Select = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setSp3File(e.target.files[0]);
    }
    e.target.value = null;
  };

  const removeObs = (e) => {
    e.stopPropagation();
    setObsFile(null);
  };

  const removeNav = (indexToRemove, e) => {
    e.stopPropagation();
    setNavFiles(navFiles.filter((_, index) => index !== indexToRemove));
  };

  const removeSp3 = (e) => {
    e.stopPropagation();
    setSp3File(null);
  };

  const handleProcessPipeline = async () => {
    if (!obsFile) {
      setError("Lütfen işlem için Gözlem (.O) dosyasını yükleyin.");
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    
    const formData = new FormData();
    formData.append("files", obsFile);
    navFiles.forEach(file => formData.append("files", file));
    if (sp3File) formData.append("files", sp3File);

    formData.append("obs_epoch", obsEpoch); 
    formData.append("dom", domValue);
    formData.append("tx", tx);
    formData.append("ty", ty);
    formData.append("tz", tz);
    formData.append("rx", rx);
    formData.append("ry", ry);
    formData.append("rz", rz);
    formData.append("scale_ppm", scalePpm);

    try {
      const response = await fetch("http://127.0.0.1:8000/api/process-full-gnss-pipeline", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Sunucu hatası veya eksik dosya.");
      }

      const data = await response.json();
      setPipelineData(data);
      setStep(2);
      
    } catch (err) {
      setError(err.message);
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleComplete = () => {
    if (!pipelineData) return;
    
    const allFileNames = [];
    if (obsFile) allFileNames.push(obsFile.name);
    navFiles.forEach(f => allFileNames.push(f.name));
    if (sp3File) allFileNames.push(sp3File.name);

    const fileNamesStr = allFileNames.join(', ');
    const stationsText = pipelineData.interpolation.stations.map(s => `${s.name} (${s.distance_km} km)`).join(', ');
    const mode = pipelineData.processing_mode;
    const utm = pipelineData.stages.step_4_utm;
    const turef = pipelineData.stages.step_3_turef;
    
    const reportText = `**GNSS İşleme ve Dönüşüm Raporu**\n\n- **İşlenen Dosyalar:** \`${fileNamesStr}\`\n- **Çözüm Modu:** ${mode}\n- **Referans Üçgen İstasyonları:** ${stationsText}\n- **Hesaplanan Ağr. Hızlar:** Vx: ${pipelineData.interpolation.vx}, Vy: ${pipelineData.interpolation.vy}\n\n**Kesin TUREF (2005.0) Koordinatları:**\n- **X:** ${turef.x} m\n- **Y:** ${turef.y} m\n- **Z:** ${turef.z} m\n\n**UTM Projeksiyon (DOM: ${domValue}° - 3 Derece):**\n- **Enlem / Boylam:** ${utm.lat} / ${utm.lon}\n- **Sağa (Easting):** ${utm.easting}\n- **Yukarı (Northing):** ${utm.northing}\n\n*Hesaplamalar lokal GNSS motoru ve HGM standart algoritmaları kullanılarak üretilmiştir.*`;
    
    onComplete(reportText);
  };

  return (
    <div className="ppp-container">
      <style dangerouslySetInnerHTML={{__html: `
        .ppp-container { display: flex; flex-direction: column; gap: 1.5rem; color: white; font-family: inherit; }
        .stepper { display: flex; justify-content: space-between; margin-bottom: 1rem; position: relative; }
        .stepper::before { content: ''; position: absolute; top: 15px; left: 0; width: 100%; height: 2px; background: rgba(255,255,255,0.1); z-index: 1; }
        .step { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; color: rgba(255,255,255,0.4); transition: all 0.3s; }
        .step.active { color: #a78bfa; }
        .step.completed { color: #34d399; }
        .step-icon { width: 32px; height: 32px; border-radius: 50%; background: #1a1a1a; border: 2px solid currentcolor; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.9rem; }
        .step-label { font-size: 0.8rem; font-weight: 500; text-align: center; max-width: 80px; }
        
        .action-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 1rem; padding: 2rem; display: flex; flex-direction: column; align-items: center; gap: 1.5rem; text-align: center; }
        .coord-display { width: 100%; background: rgba(0,0,0,0.3); padding: 1.5rem; border-radius: 0.75rem; border: 1px solid rgba(167, 139, 250, 0.2); display: flex; flex-direction: column; gap: 0.5rem; font-family: monospace; font-size: 1.05rem; color: #c4b5fd; margin-top: 1rem; }
        .coord-row { display: flex; justify-content: space-around; width: 100%; }
        
        .cyber-btn { display: flex; align-items: center; gap: 0.75rem; background: rgba(167, 139, 250, 0.15); color: #c4b5fd; border: 1px solid rgba(167, 139, 250, 0.3); padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; transition: all 0.3s; }
        .cyber-btn:hover:not(:disabled) { background: rgba(167, 139, 250, 0.3); transform: translateY(-2px); box-shadow: 0 0 15px rgba(167, 139, 250, 0.2); }
        .cyber-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .cyber-btn.success { background: rgba(52, 211, 153, 0.15); color: #6ee7b7; border-color: rgba(52, 211, 153, 0.3); }
        
        .file-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; width: 100%; }
        .file-box { border: 2px dashed rgba(167, 139, 250, 0.4); border-radius: 0.75rem; padding: 1.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; cursor: pointer; transition: all 0.3s; background: rgba(0,0,0,0.2); }
        .file-box:hover { border-color: rgba(167, 139, 250, 0.8); background: rgba(167, 139, 250, 0.05); }
        
        .file-badge { display: flex; align-items: center; gap: 0.5rem; background: rgba(167, 139, 250, 0.15); color: #c4b5fd; padding: 0.4rem 0.8rem; border-radius: 2rem; font-family: monospace; font-size: 0.75rem; border: 1px solid rgba(167, 139, 250, 0.3); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .file-badge button { background: none; border: none; color: inherit; cursor: pointer; display: flex; align-items: center; padding: 0; }
        .file-badge button:hover { color: #ef4444; }
        
        .param-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; width: 100%; text-align: left; }
        .param-group { display: flex; flex-direction: column; gap: 0.3rem; }
        .param-label { font-size: 0.75rem; color: rgba(255,255,255,0.6); }
        .param-input { background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(167, 139, 250, 0.4); padding: 0.5rem; border-radius: 0.4rem; font-family: monospace; font-size: 0.9rem; outline: none; }
        .param-input:focus { border-color: rgba(167, 139, 250, 0.8); }

        .error-msg { background: rgba(239, 68, 68, 0.1); color: #f87171; padding: 0.75rem; border-radius: 0.5rem; border: 1px solid rgba(239, 68, 68, 0.3); font-size: 0.9rem; width: 100%; text-align: center; }
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }

        .mode-badge { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.8rem; border-radius: 1rem; font-size: 0.8rem; font-weight: bold; margin-bottom: 1rem; }
        .mode-ppp { background: rgba(52, 211, 153, 0.2); color: #34d399; border: 1px solid #34d399; }
        .mode-spp { background: rgba(250, 204, 21, 0.2); color: #facc15; border: 1px solid #facc15; }
      `}} />

      {error && <div className="error-msg">{error}</div>}

      <div className="stepper">
        {[
          { num: 1, label: 'Veri & Parametre' },
          { num: 2, label: 'Lokal Çözüm' },
          { num: 3, label: 'Epok Hızı' },
          { num: 4, label: 'UTM Sonuç' }
        ].map((s) => (
          <div key={s.num} className={`step ${step === s.num ? 'active' : ''} ${step > s.num ? 'completed' : ''}`}>
            <div className="step-icon">
              {step > s.num ? <CheckCircle size={18} /> : s.num}
            </div>
            <span className="step-label">{s.label}</span>
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="action-card">
          <UploadCloud size={48} color="rgba(167, 139, 250, 0.8)" />
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Lokal GNSS (SPP/PPP) Motoru</h3>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
              RINEX dosyalarınızı yükleyin ve dönüşüm parametrelerini belirleyin.
            </p>
          </div>
          
          <div className="file-grid">
            <div className="file-box" onClick={() => obsInputRef.current.click()}>
              <input type="file" ref={obsInputRef} style={{ display: 'none' }} accept=".o,.obs,.26o" onChange={handleObsSelect} />
              <FileText size={28} color={obsFile ? "#34d399" : "rgba(255,255,255,0.4)"} />
              <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)' }}>Gözlem (.o)</span>
              {obsFile && (
                <div className="file-badge" style={{ marginTop: '0.5rem' }}>
                  {obsFile.name}
                  <button onClick={removeObs}><X size={14} /></button>
                </div>
              )}
            </div>

            <div className="file-box" onClick={() => navInputRef.current.click()}>
              <input type="file" multiple ref={navInputRef} style={{ display: 'none' }} accept=".n,.g,.nav,.26n,.26g" onChange={handleNavSelect} />
              <FileText size={28} color={navFiles.length > 0 ? "#34d399" : "rgba(255,255,255,0.4)"} />
              <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)' }}>Navigasyon (.n, .g)</span>
              {navFiles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem', width: '100%' }}>
                  {navFiles.map((f, i) => (
                    <div key={i} className="file-badge">
                      {f.name}
                      <button onClick={(e) => removeNav(i, e)}><X size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="file-box" onClick={() => sp3InputRef.current.click()}>
              <input type="file" ref={sp3InputRef} style={{ display: 'none' }} accept=".sp3,.eph" onChange={handleSp3Select} />
              <FileText size={28} color={sp3File ? "#34d399" : "rgba(255,255,255,0.4)"} />
              <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)' }}>Yörünge (.sp3)</span>
              {sp3File && (
                <div className="file-badge" style={{ marginTop: '0.5rem' }}>
                  {sp3File.name}
                  <button onClick={removeSp3}><X size={14} /></button>
                </div>
              )}
            </div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.1)', width: '100%' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: '#c4b5fd', fontSize: '0.95rem', textAlign: 'left' }}>Parametreler & Projeksiyon</h4>
            
            <div className="param-grid" style={{ marginBottom: '1rem' }}>
              <div className="param-group">
                <label className="param-label">DOM Değeri</label>
                <select className="param-input" value={domValue} onChange={(e) => setDomValue(Number(e.target.value))}>
                  <option value={27}>27°</option>
                  <option value={30}>30°</option>
                  <option value={33}>33°</option>
                  <option value={36}>36°</option>
                  <option value={39}>39°</option>
                  <option value={42}>42°</option>
                  <option value={45}>45°</option>
                </select>
              </div>
              <div className="param-group">
                <label className="param-label">Gözlem Epoğu</label>
                <input type="number" step="0.01" className="param-input" value={obsEpoch} onChange={e => setObsEpoch(e.target.value)} />
              </div>
            </div>

            <h4 style={{ margin: '1rem 0 0.5rem 0', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', textAlign: 'left' }}>Helmert Dönüşüm (ITRF ➔ TUREF)</h4>
            <div className="param-grid">
              <div className="param-group">
                <label className="param-label">Tx (m)</label>
                <input type="number" step="0.001" className="param-input" value={tx} onChange={e => setTx(e.target.value)} />
              </div>
              <div className="param-group">
                <label className="param-label">Ty (m)</label>
                <input type="number" step="0.001" className="param-input" value={ty} onChange={e => setTy(e.target.value)} />
              </div>
              <div className="param-group">
                <label className="param-label">Tz (m)</label>
                <input type="number" step="0.001" className="param-input" value={tz} onChange={e => setTz(e.target.value)} />
              </div>
              <div className="param-group">
                <label className="param-label">Ölçek (ppm)</label>
                <input type="number" step="0.01" className="param-input" value={scalePpm} onChange={e => setScalePpm(e.target.value)} />
              </div>
              <div className="param-group">
                <label className="param-label">Rx (sn)</label>
                <input type="number" step="0.001" className="param-input" value={rx} onChange={e => setRx(e.target.value)} />
              </div>
              <div className="param-group">
                <label className="param-label">Ry (sn)</label>
                <input type="number" step="0.001" className="param-input" value={ry} onChange={e => setRy(e.target.value)} />
              </div>
              <div className="param-group">
                <label className="param-label">Rz (sn)</label>
                <input type="number" step="0.001" className="param-input" value={rz} onChange={e => setRz(e.target.value)} />
              </div>
            </div>
          </div>

          <button className="cyber-btn" onClick={handleProcessPipeline} disabled={isProcessing || !obsFile} style={{ marginTop: '0.5rem' }}>
            {isProcessing ? <RefreshCw className="spinner" size={20} /> : <ArrowRight size={20} />}
            {isProcessing ? 'Motor Çalışıyor...' : 'Lokal Çözümü Başlat'}
          </button>
        </div>
      )}

      {step === 2 && pipelineData && (
        <div className="action-card">
          <Target size={48} color="rgba(167, 139, 250, 0.8)" />
          
          <div className={`mode-badge ${pipelineData.processing_mode.includes('PPP') ? 'mode-ppp' : 'mode-spp'}`}>
            <CheckCircle size={14} /> Modül: {pipelineData.processing_mode}
          </div>

          <div>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>ITRF ve Helmert Hesaplamaları</h3>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
              Motor verileri işledi ve referans datum dönüşümlerini gerçekleştirdi.
            </p>
          </div>
          
          <div className="coord-display">
            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>Ham ITRF Koordinatları</span>
            <div className="coord-row">
              <span>X: {pipelineData.stages.step_1_itrf.x}</span>
              <span>Y: {pipelineData.stages.step_1_itrf.y}</span>
              <span>Z: {pipelineData.stages.step_1_itrf.z}</span>
            </div>
          </div>
          <button className="cyber-btn" onClick={() => setStep(3)}>
            <ArrowRight size={20} /> TUSAGA Hız Enterpolasyonu'na Geç
          </button>
        </div>
      )}

      {step === 3 && pipelineData && (
        <div className="action-card">
          <FastForward size={48} color="rgba(167, 139, 250, 0.8)" />
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Otomatik Epok Kaydırma (TUREF)</h3>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
              En yakın CORS istasyonları (Ters Mesafe Ağırlıklı IDW) kullanılarak nokta hızları hesaplandı.
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center', flexWrap: 'wrap' }}>
            {pipelineData.interpolation.stations.map((st, i) => (
              <div key={i} style={{ background: 'rgba(167, 139, 250, 0.1)', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid rgba(167, 139, 250, 0.3)' }}>
                <strong style={{ color: '#c4b5fd' }}>{st.name}</strong> 
                <span style={{ fontSize: '0.8rem', marginLeft: '0.5rem', color: 'rgba(255,255,255,0.5)' }}>({st.distance_km} km)</span>
              </div>
            ))}
          </div>

          <div className="coord-display" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>Tahmini Nokta Hız Vektörleri (m/yıl)</span>
            <div className="coord-row">
              <span>Vx: {pipelineData.interpolation.vx}</span>
              <span>Vy: {pipelineData.interpolation.vy}</span>
              <span>Vz: {pipelineData.interpolation.vz}</span>
            </div>
          </div>

          <button className="cyber-btn" onClick={() => setStep(4)}>
            <ArrowRight size={20} /> UTM Projeksiyon Sonuçlarına Geç
          </button>
        </div>
      )}

      {step === 4 && pipelineData && (
        <div className="action-card" style={{ borderColor: 'rgba(52, 211, 153, 0.3)' }}>
          <MapPin size={56} color="#34d399" />
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#34d399' }}>UTM Projeksiyon Koordinatları</h3>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
              DOM {domValue}° | 3 Derecelik Dilim | GRS80 / WGS84
            </p>
          </div>
          
          <div className="coord-display" style={{ borderColor: 'rgba(52, 211, 153, 0.3)', color: '#6ee7b7', gap: '1rem' }}>
            <div className="coord-row" style={{ borderBottom: '1px solid rgba(52, 211, 153, 0.2)', paddingBottom: '0.5rem' }}>
              <span>Enlem: {pipelineData.stages.step_4_utm.lat}</span>
              <span>Boylam: {pipelineData.stages.step_4_utm.lon}</span>
            </div>
            <div className="coord-row">
              <span style={{ fontWeight: 'bold' }}>Sağa (Y): {pipelineData.stages.step_4_utm.easting}</span>
              <span style={{ fontWeight: 'bold' }}>Yukarı (X): {pipelineData.stages.step_4_utm.northing}</span>
            </div>
          </div>

          <button className="cyber-btn success" onClick={handleComplete}>
            <FileCheck size={20} /> GNSS Analiz Raporunu Aktar
          </button>
        </div>
      )}
    </div>
  );
};

export default PPPModule;
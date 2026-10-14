import React, { useState } from 'react';

const LevelingModule = ({ onComplete }) => {
  const [startElevation, setStartElevation] = useState("0.000");
  
  // Kutucukların içi 0.00 olarak başlatıldı
  const [rows, setRows] = useState([
    { id: 1, station: 'Mil', length: '0.00', bs: '0.00', fs: '' },
    { id: 2, station: 'TP1', length: '0.00', bs: '', fs: '0.00' }
  ]);

  const addRow = () => {
    const newId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) + 1 : 1;
    // Yeni eklenen satırların içi de 0.00 formatında gelecek
    setRows([...rows, { id: newId, station: `TP${rows.length}`, length: '0.00', bs: '0.00', fs: '0.00' }]);
  };

  const removeRow = (id) => {
    if (rows.length <= 2) return;
    setRows(rows.filter(row => row.id !== id));
  };

  const updateRow = (id, field, value) => {
    setRows(rows.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  let totalLengthM = 0;
  let totalBS = 0;
  let totalFS = 0;

  // --- HESAPLAMALAR ---
  const computedRows = rows.map((row, index) => {
    const isFirst = index === 0;
    const isLast = index === rows.length - 1;

    const lengthM = isFirst ? 0 : (parseFloat(row.length) || 0);
    const bs = isLast ? 0 : (parseFloat(row.bs) || 0);
    const fs = isFirst ? 0 : (parseFloat(row.fs) || 0);

    totalLengthM += lengthM;
    totalBS += bs;
    totalFS += fs;

    let deltaH = 0;
    if (!isFirst) {
      deltaH = (parseFloat(row.bs) || 0) - fs; 
    }

    return { ...row, numLengthM: lengthM, numBs: bs, numFs: fs, deltaH, isFirst, isLast };
  });

  const closureErrorDm = totalBS - totalFS;
  const closureErrorMm = closureErrorDm * 100;

  const totalLengthKm = totalLengthM / 1000;
  const maxErrorMm = 12 * Math.sqrt(totalLengthKm);
  const isAcceptable = Math.abs(closureErrorMm) <= maxErrorMm;

  let currentElevation = parseFloat(startElevation) || 0;
  
  const finalRows = computedRows.map((row, index) => {
    if (row.isFirst) {
      return { ...row, adjustedDeltaH: null, elevation: currentElevation, cumDist: 0 };
    }
    
    const cumDist = computedRows.slice(0, index + 1).reduce((acc, curr) => acc + curr.numLengthM, 0);
    
    const correction = totalLengthM > 0 ? -(closureErrorDm / totalLengthM) * row.numLengthM : 0;
    const adjustedDeltaH = (parseFloat(rows[index-1].bs) || 0) - row.numFs + correction;
    currentElevation += adjustedDeltaH;

    return { ...row, correction, adjustedDeltaH, elevation: currentElevation, cumDist };
  });

  // --- SİMÜLASYON VERİSİ ---
  const simData = finalRows.map(r => ({
    x: r.cumDist,
    y: r.elevation,
    bs: r.numBs,
    fs: r.numFs,
    name: r.station
  }));

  const setups = [];
  for (let i = 1; i < simData.length; i++) {
    const prev = simData[i-1];
    const curr = simData[i];
    
    const instX = (prev.x + curr.x) / 2;
    const hi = prev.y + prev.bs; 
    
    setups.push({
      startX: prev.x,
      endX: curr.x,
      instX: instX,
      hi: hi,
      prevY: prev.y,
      currY: curr.y
    });
  }

  const allX = simData.map(d => d.x);
  const allY = simData.map(d => d.y);
  
  setups.forEach(s => {
    allY.push(s.hi);
  });
  
  simData.forEach(d => {
    allY.push(d.y + Math.max(d.bs, d.fs, 15));
  });

  const minX = 0;
  const maxX = Math.max(...allX, 10);
  const minY = Math.min(...allY, 0) - 10;
  const maxY = Math.max(...allY, 20) + 10;

  const svgWidth = 900;
  const svgHeight = 350;
  const padding = 50;

  const scaleX = (x) => padding + ((x - minX) / (maxX - minX || 1)) * (svgWidth - 2 * padding);
  const scaleY = (y) => svgHeight - padding - ((y - minY) / (maxY - minY || 1)) * (svgHeight - 2 * padding);

  const groundPoints = `${scaleX(minX)},${svgHeight} ` + 
                       simData.map(d => `${scaleX(d.x)},${scaleY(d.y)}`).join(' ') + 
                       ` ${scaleX(maxX)},${svgHeight}`;


  const handleFinish = () => {
    if (!onComplete) return;

    let reportText = `### 📊 Geometrik Nivelman Hata Dağıtımı Raporu\n\n`;
    reportText += `- **Toplam Mesafe (L):** ${totalLengthM.toFixed(1)} m\n`;
    reportText += `- **Ölçülen Kapanma Hatası (e):** ${closureErrorMm.toFixed(2)} mm\n`;
    reportText += `- **İzin Verilen Maksimum Hata Sınırı (E):** ± ${maxErrorMm.toFixed(2)} mm\n`;
    reportText += `- **Durum:** ${isAcceptable ? '✅ Başarılı (Ölçü Sınırlar İçinde)' : '❌ Başarısız (Hata Sınırı Aşıldı)'}\n\n`;
    
    reportText += `**Dengeleme Tablosu:**\n\n`;
    reportText += `| İstasyon | Mesafe (m) | B.S. (dm) | F.S. (dm) | Düzeltilmiş ΔH (dm) | Yükseklik (dm) |\n`;
    reportText += `| :--- | :---: | :---: | :---: | :---: | :---: |\n`;
    
    finalRows.forEach((r) => {
      const lenStr = r.isFirst ? '-' : r.numLengthM.toString();
      const fsStr = r.isFirst ? '-' : r.numFs.toFixed(2);
      const bsStr = r.isLast ? '-' : r.numBs.toFixed(2);
      const dhStr = r.isFirst ? '-' : r.adjustedDeltaH.toFixed(2);
      reportText += `| ${r.station} | ${lenStr} | ${bsStr} | ${fsStr} | ${dhStr} | ${r.elevation.toFixed(2)} |\n`;
    });

    onComplete(reportText);
  };

  return (
    <div style={{ padding: '30px', backgroundColor: '#0f172a', color: '#f8fafc', fontFamily: 'sans-serif', borderRadius: '16px', border: '1px solid #334155', width: '100%', boxSizing: 'border-box', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '15px', borderBottom: '1px solid #1e293b', paddingBottom: '15px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#38bdf8', fontSize: '24px', fontWeight: 'bold' }}>Geometrik Nivelman Aracı</h2>
          <p style={{ margin: '6px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>Mesafe: Metre (m) | Ölçü: Desimetre (dm)</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#1e293b', padding: '10px 16px', borderRadius: '10px', border: '1px solid #475569' }}>
          <label style={{ fontSize: '14px', color: '#cbd5e1', fontWeight: '500' }}>Başlangıç Yüksekliği (dm):</label>
          <input 
            type="number" 
            step="0.001"
            value={startElevation} 
            onChange={(e) => setStartElevation(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#0f172a', color: 'white', outline: 'none', width: '110px', textAlign: 'center', fontWeight: 'bold', fontSize: '15px' }}
          />
        </div>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #1e293b' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'center', minWidth: '750px' }}>
          <thead>
            <tr style={{ backgroundColor: '#1e293b', color: '#94a3b8', borderBottom: '2px solid #334155' }}>
              <th style={{ padding: '14px' }}>İstasyon</th>
              <th style={{ padding: '14px' }}>Mesafe (m)</th>
              <th style={{ padding: '14px' }}>Geri - B.S. (dm)</th>
              <th style={{ padding: '14px' }}>İleri - F.S. (dm)</th>
              <th style={{ padding: '14px' }}>Düzeltilmiş ΔH</th>
              <th style={{ padding: '14px' }}>Yükseklik (dm)</th>
              <th style={{ padding: '14px' }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {finalRows.map((row) => (
              <tr key={row.id} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '12px' }}>
                  <input type="text" value={row.station} onChange={(e) => updateRow(row.id, 'station', e.target.value)} style={inputStyle} />
                </td>
                <td style={{ padding: '12px' }}>
                  {row.isFirst ? <span style={{ color: '#64748b' }}>-</span> : (
                    <input type="number" step="0.1" value={row.length} onChange={(e) => updateRow(row.id, 'length', e.target.value)} style={inputStyle} />
                  )}
                </td>
                <td style={{ padding: '12px' }}>
                  {row.isLast ? <span style={{ color: '#64748b' }}>-</span> : (
                    <input type="number" step="0.01" value={row.bs} onChange={(e) => updateRow(row.id, 'bs', e.target.value)} style={inputStyle} />
                  )}
                </td>
                <td style={{ padding: '12px' }}>
                  {row.isFirst ? <span style={{ color: '#64748b' }}>-</span> : (
                    <input type="number" step="0.01" value={row.fs} onChange={(e) => updateRow(row.id, 'fs', e.target.value)} style={inputStyle} />
                  )}
                </td>
                <td style={{ padding: '12px', color: '#10b981', fontWeight: 'bold', fontFamily: 'monospace' }}>
                  {row.isFirst ? '-' : row.adjustedDeltaH.toFixed(2)}
                </td>
                <td style={{ padding: '12px', color: '#facc15', fontWeight: 'bold', fontFamily: 'monospace' }}>
                  {row.elevation.toFixed(2)}
                </td>
                <td style={{ padding: '12px' }}>
                  {!row.isFirst && !row.isLast && (
                    <button onClick={() => removeRow(row.id)} style={deleteBtnStyle}>Sil</button>
                  )}
                </td>
              </tr>
            ))}
            
            <tr style={{ backgroundColor: '#1e293b', fontWeight: 'bold', borderTop: '2px solid #334155' }}>
              <td style={{ padding: '14px', textAlign: 'right' }}>TOPLAM:</td>
              <td style={{ padding: '14px' }}>{totalLengthM.toFixed(1)} m</td>
              <td style={{ padding: '14px', fontFamily: 'monospace' }}>{totalBS.toFixed(2)}</td>
              <td style={{ padding: '14px', fontFamily: 'monospace' }}>{totalFS.toFixed(2)}</td>
              <td style={{ padding: '14px', color: '#10b981' }}>-</td>
              <td colSpan="2"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Butonlar artık tablonun hemen altında */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <button onClick={addRow} style={addBtnStyle}>+ Yeni İstasyon (TP) Ekle</button>
        <button onClick={handleFinish} style={finishBtnStyle}>✓ Ölçümü Tamamla ve Raporla</button>
      </div>

      <div style={{ padding: '20px', backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid #334155' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#f8fafc', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', animation: 'pulse 1.5s infinite' }}></span>
          Canlı Arazi Kesiti & Nivelman Ağı
        </h3>
        
        <div style={{ overflowX: 'auto', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #475569', boxShadow: 'inset 0 4px 6px rgba(0,0,0,0.3)' }}>
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="350" style={{ minWidth: '700px' }}>
            <defs>
              <linearGradient id="groundGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            <polygon points={groundPoints} fill="url(#groundGrad)" />
            <polyline 
              points={simData.map(d => `${scaleX(d.x)},${scaleY(d.y)}`).join(' ')} 
              fill="none" stroke="#a855f7" strokeWidth="3" 
            />

            {simData.map((d, i) => (
              <g key={`station-${i}`}>
                <line 
                  x1={scaleX(d.x)} y1={scaleY(d.y)} 
                  x2={scaleX(d.x)} y2={scaleY(d.y + Math.max(d.bs, d.fs, 15))} 
                  stroke="#fbbf24" strokeWidth="4" strokeLinecap="round" 
                />
                <line 
                  x1={scaleX(d.x)} y1={scaleY(d.y)} 
                  x2={scaleX(d.x)} y2={scaleY(d.y + Math.max(d.bs, d.fs, 15))} 
                  stroke="#fff" strokeWidth="1" strokeDasharray="2,2" 
                />
                <circle cx={scaleX(d.x)} cy={scaleY(d.y)} r="5" fill="#f8fafc" />
                <text x={scaleX(d.x)} y={svgHeight - 15} fill="#94a3b8" fontSize="12" textAnchor="middle" fontWeight="bold">
                  {d.name} ({d.x}m)
                </text>
              </g>
            ))}

            {setups.map((s, i) => (
              <g key={`setup-${i}`}>
                <line 
                  x1={scaleX(s.startX)} y1={scaleY(s.hi)} 
                  x2={scaleX(s.endX)} y2={scaleY(s.hi)} 
                  stroke="#10b981" strokeWidth="2" strokeDasharray="6,4" 
                />
                <path 
                  d={`M ${scaleX(s.instX)} ${scaleY(s.hi)} L ${scaleX(s.instX)-8} ${scaleY( (s.prevY+s.currY)/2 )} L ${scaleX(s.instX)+8} ${scaleY( (s.prevY+s.currY)/2 )} Z`} 
                  fill="none" stroke="#94a3b8" strokeWidth="2"
                />
                <rect x={scaleX(s.instX)-6} y={scaleY(s.hi)-4} width="12" height="6" fill="#ef4444" rx="2" />
                <text x={scaleX(s.instX)} y={scaleY(s.hi) - 10} fill="#10b981" fontSize="10" textAnchor="middle">
                  HI: {s.hi.toFixed(1)}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
      `}</style>

    </div>
  );
};

const inputStyle = {
  width: '80px', padding: '6px', backgroundColor: '#0f172a', color: 'white',
  border: '1px solid #475569', borderRadius: '6px', outline: 'none',
  textAlign: 'center', fontFamily: 'monospace', fontSize: '14px'
};
const addBtnStyle = {
  padding: '10px 18px', backgroundColor: '#3b82f6', color: 'white',
  border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px'
};
const finishBtnStyle = {
  padding: '12px 24px', backgroundColor: '#10b981', color: 'white', border: 'none',
  borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px',
  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
};
const deleteBtnStyle = {
  padding: '5px 10px', backgroundColor: '#ef4444', color: 'white', border: 'none',
  borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
};

export default LevelingModule;
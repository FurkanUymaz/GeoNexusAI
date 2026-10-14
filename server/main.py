from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List
import shutil
import os
import time
import torch
import gc
import math
import tempfile
import subprocess
import json
from pathlib import Path
import numpy as np

from processor import process_pdf, extract_outline, extract_llm_outline, build_fallback_outline
from brain import GeoNexusBrain
from db import Base, engine, get_db, SessionLocal
import models

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if not os.path.exists("uploads"):
    os.makedirs("uploads")

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

brain = GeoNexusBrain()

class ChatRequest(BaseModel):
    message: str

class ChapterCreate(BaseModel):
    document_id: int
    title: str
    order_index: int

class TopicCreate(BaseModel):
    chapter_id: int
    title: str
    order_index: int
    source_page_start: int | None = None
    source_page_end: int | None = None

@app.get("/")
def read_root():
    return {"mesaj": "GeoNexus Kendi Yazdigimiz Beyinle Aktif!"}

@app.post("/upload")
async def upload_pdf(background_tasks: BackgroundTasks, file: UploadFile = File(...), db: Session = Depends(get_db)):
    file_path = f"uploads/{file.filename}"

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    chunks = process_pdf(file_path)
    brain.add_pdf_chunks(chunks, source_name=file.filename)

    existing = db.query(models.Document).filter(models.Document.filename == file.filename).first()
    if not existing:
        new_document = models.Document(filename=file.filename)
        db.add(new_document)
        db.commit()
        db.refresh(new_document)
        document_id = new_document.id
    else:
        document_id = existing.id

    outline_found = False
    used_fallback = False
    existing_chapters = db.query(models.Chapter).filter(models.Chapter.document_id == document_id).first()
    
    if not existing_chapters:
        outline = extract_outline(file_path)
        if outline:
            outline_found = True
        else:
            outline = extract_llm_outline(file_path, brain)
            if outline:
                outline_found = True
            else:
                outline = build_fallback_outline(file_path)
                used_fallback = True

        for chapter_index, chapter_node in enumerate(outline):
            chapter = models.Chapter(
                document_id=document_id,
                title=chapter_node["title"],
                order_index=chapter_index
            )
            db.add(chapter)
            db.commit()
            db.refresh(chapter)

            topic_nodes = chapter_node["children"] if chapter_node["children"] else [chapter_node]
            for topic_index, topic_node in enumerate(topic_nodes):
                topic_title = topic_node["title"]

                if used_fallback:
                    context_items = brain.get_context_by_page_range(file.filename, topic_node["page"], topic_node["page_end"])
                    generated_title = brain.generate_topic_title(context_items[:2])
                    topic_title = f"{generated_title} (s. {topic_node['page'] + 1}-{topic_node['page_end'] + 1})"

                topic = models.Topic(
                    chapter_id=chapter.id,
                    title=topic_title,
                    order_index=topic_index,
                    source_page_start=topic_node["page"],
                    source_page_end=topic_node["page_end"]
                )
                db.add(topic)
        db.commit()

    return {
        "filename": file.filename,
        "chunk_count": len(chunks),
        "document_id": document_id,
        "outline_detected": outline_found,
        "used_fallback": used_fallback
    }

@app.post("/chat")
async def chat(request: ChatRequest):
    context_items = brain.search_relevant_context(request.message)
    answer = brain.generate_answer(request.message, context_items)
    
    if answer:
        answer = answer.replace("\\[", "$$").replace("\\]", "$$")
        answer = answer.replace("\\(", "$").replace("\\)", "$")
        
    sources = [{"source": c["source"], "page": c["page"]} for c in context_items]
    return {"answer": answer, "sources": sources}

@app.get("/documents")
def list_documents(db: Session = Depends(get_db)):
    documents = db.query(models.Document).all()
    return [{"id": d.id, "filename": d.filename} for d in documents]

@app.post("/chapters")
def create_chapter(request: ChapterCreate, db: Session = Depends(get_db)):
    chapter = models.Chapter(
        document_id=request.document_id,
        title=request.title,
        order_index=request.order_index
    )
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return {"id": chapter.id, "title": chapter.title}

@app.get("/documents/{document_id}/chapters")
def list_chapters(document_id: int, db: Session = Depends(get_db)):
    chapters = db.query(models.Chapter).filter(models.Chapter.document_id == document_id).order_by(models.Chapter.order_index).all()
    return [{"id": c.id, "title": c.title, "order_index": c.order_index} for c in chapters]

@app.post("/topics")
def create_topic(request: TopicCreate, db: Session = Depends(get_db)):
    topic = models.Topic(
        chapter_id=request.chapter_id,
        title=request.title,
        order_index=request.order_index,
        source_page_start=request.source_page_start,
        source_page_end=request.source_page_end
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return {"id": topic.id, "title": topic.title}

@app.get("/chapters/{chapter_id}/topics")
def list_topics(chapter_id: int, db: Session = Depends(get_db)):
    topics = db.query(models.Topic).filter(models.Topic.chapter_id == chapter_id).order_by(models.Topic.order_index).all()
    return [{"id": t.id, "title": t.title, "order_index": t.order_index} for t in topics]

@app.get("/topics/{topic_id}/content")
def get_topic_content(topic_id: int, db: Session = Depends(get_db)):
    topic = db.query(models.Topic).filter(models.Topic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Konu bulunamadi")

    cached = db.query(models.TopicContent).filter(models.TopicContent.topic_id == topic_id).first()
    if cached:
        return {"topic_id": topic_id, "lecture_text": cached.lecture_text, "cached": True}

    document = topic.chapter.document
    
    try:
        context_items = brain.get_context_by_page_range(document.filename, topic.source_page_start, topic.source_page_end)
        
        if len(context_items) > 10:
            context_items = context_items[:10] 
            
        lecture_text = brain.generate_lecture(topic.title, context_items)

        if lecture_text:
            lecture_text = lecture_text.replace("\\[", "$$").replace("\\]", "$$")
            lecture_text = lecture_text.replace("\\(", "$").replace("\\)", "$")

        new_content = models.TopicContent(topic_id=topic_id, lecture_text=lecture_text, model_version="qwen2.5-3b-instruct")
        db.add(new_content)
        db.commit()

        torch.cuda.empty_cache()
        gc.collect()

        return {"topic_id": topic_id, "lecture_text": lecture_text, "cached": False}

    except torch.cuda.OutOfMemoryError:
        torch.cuda.empty_cache()
        gc.collect()
        fallback_text = "⚠️ Üzgünüm, bu konunun içeriği tek seferde işlenemeyecek kadar büyük olduğu için bellek sınırına takıldım. Lütfen daha dar kapsamlı (alt başlıklara sahip) bir konu seçin veya bu konuyu sohbet kısmından parça parça sorarak özetlememi isteyin."
        return {"topic_id": topic_id, "lecture_text": fallback_text, "cached": False}
    except Exception as e:
        print(f"Bilinmeyen Hata: {str(e)}")
        raise HTTPException(status_code=500, detail="Özet üretilirken bir hata oluştu.")

def run_pregeneration(document_id: int):
    db = SessionLocal()
    try:
        document = db.query(models.Document).filter(models.Document.id == document_id).first()
        if not document:
            return

        chapters = db.query(models.Chapter).filter(models.Chapter.document_id == document_id).all()

        for chapter in chapters:
            topics = db.query(models.Topic).filter(models.Topic.chapter_id == chapter.id).all()
            for topic in topics:
                existing = db.query(models.TopicContent).filter(models.TopicContent.topic_id == topic.id).first()
                if existing:
                    continue

                try:
                    context_items = brain.get_context_by_page_range(document.filename, topic.source_page_start, topic.source_page_end)
                    if len(context_items) > 10: context_items = context_items[:10]
                    
                    lecture_text = brain.generate_lecture(topic.title, context_items)
                    
                    if lecture_text:
                        lecture_text = lecture_text.replace("\\[", "$$").replace("\\]", "$$")
                        lecture_text = lecture_text.replace("\\(", "$").replace("\\)", "$")
                        
                    new_content = models.TopicContent(topic_id=topic.id, lecture_text=lecture_text, model_version="qwen2.5-3b-instruct")
                    db.add(new_content)
                    db.commit()
                    
                    torch.cuda.empty_cache()
                    gc.collect()
                except torch.cuda.OutOfMemoryError:
                    db.rollback()
                    torch.cuda.empty_cache()
                    gc.collect()
                except Exception:
                    db.rollback()
    finally:
        db.close()

@app.post("/documents/{document_id}/pregenerate")
def pregenerate_document_content(document_id: int, db: Session = Depends(get_db)):
    document = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Belge bulunamadi")

    chapters = db.query(models.Chapter).filter(models.Chapter.document_id == document_id).all()

    generated_count = 0
    skipped_count = 0
    failed_topics = []

    for chapter in chapters:
        topics = db.query(models.Topic).filter(models.Topic.chapter_id == chapter.id).all()
        for topic in topics:
            existing = db.query(models.TopicContent).filter(models.TopicContent.topic_id == topic.id).first()
            if existing:
                skipped_count += 1
                continue

            try:
                context_items = brain.get_context_by_page_range(document.filename, topic.source_page_start, topic.source_page_end)
                if len(context_items) > 10: context_items = context_items[:10]

                lecture_text = brain.generate_lecture(topic.title, context_items)
                
                if lecture_text:
                    lecture_text = lecture_text.replace("\\[", "$$").replace("\\]", "$$")
                    lecture_text = lecture_text.replace("\\(", "$").replace("\\)", "$")
                    
                new_content = models.TopicContent(topic_id=topic.id, lecture_text=lecture_text, model_version="qwen2.5-3b-instruct")
                db.add(new_content)
                db.commit()
                generated_count += 1
                
                torch.cuda.empty_cache()
                gc.collect()
            except torch.cuda.OutOfMemoryError as error:
                torch.cuda.empty_cache()
                gc.collect()
                failed_topics.append({"topic_id": topic.id, "title": topic.title, "error": "VRAM Yetersiz"})
            except Exception as error:
                failed_topics.append({"topic_id": topic.id, "title": topic.title, "error": str(error)})

    return {
        "document_id": document_id,
        "generated_count": generated_count,
        "skipped_count": skipped_count,
        "failed_topics": failed_topics
    }

base_dir = os.path.dirname(os.path.abspath(__file__))
stations_file = os.path.join(base_dir, "tusaga_stations.json")

try:
    with open(stations_file, 'r', encoding='utf-8') as f:
        TUSAGA_STATIONS = json.load(f)
except FileNotFoundError:
    TUSAGA_STATIONS = {}

def calculate_weighted_velocities(px, py, pz):
    distances = []
    for name, data in TUSAGA_STATIONS.items():
        d = math.sqrt((px - data["x"])**2 + (py - data["y"])**2 + (pz - data["z"])**2)
        distances.append((d, name, data))
    
    distances.sort(key=lambda item: item[0])
    closest_3 = distances[:3]
    
    sum_w = 0.0
    sum_vx_w, sum_vy_w, sum_vz_w = 0.0, 0.0, 0.0
    stations_used = []

    for d, name, data in closest_3:
        if d == 0: d = 0.001 
        
        weight = 1.0 / d 
        sum_w += weight
        
        sum_vx_w += data["vx"] * weight
        sum_vy_w += data["vy"] * weight
        sum_vz_w += data["vz"] * weight
        
        stations_used.append({"name": name, "distance_km": round(d / 1000.0, 2)})

    final_vx = sum_vx_w / sum_w if sum_w > 0 else 0.0
    final_vy = sum_vy_w / sum_w if sum_w > 0 else 0.0
    final_vz = sum_vz_w / sum_w if sum_w > 0 else 0.0

    return final_vx, final_vy, final_vz, stations_used

def cartesian_to_geo(x, y, z):
    a = 6378137.0
    f = 1 / 298.257222101
    b = a * (1 - f)
    e2 = 1 - (b**2 / a**2)
    ep2 = (a**2 / b**2) - 1

    p = math.sqrt(x**2 + y**2)
    th = math.atan2(a * z, b * p)

    lon = math.atan2(y, x)
    lat = math.atan2((z + ep2 * b * math.sin(th)**3), (p - e2 * a * math.cos(th)**3))
    
    N = a / math.sqrt(1 - e2 * math.sin(lat)**2)
    h = p / math.cos(lat) - N

    return math.degrees(lat), math.degrees(lon), h

def geo_to_utm_3degree(lat_deg, lon_deg, dom):
    a = 6378137.0
    f = 1 / 298.257222101
    e2 = 2*f - f**2
    ep2 = e2 / (1 - e2)

    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    lon0 = math.radians(dom)

    N = a / math.sqrt(1 - e2 * math.sin(lat)**2)
    T = math.tan(lat)**2
    C = ep2 * math.cos(lat)**2
    A = math.cos(lat) * (lon - lon0)

    M = a * (
        (1 - e2/4 - 3*e2**2/64 - 5*e2**3/256) * lat
        - (3*e2/8 + 3*e2**2/32 + 45*e2**3/1024) * math.sin(2*lat)
        + (15*e2**2/256 + 45*e2**3/1024) * math.sin(4*lat)
        - (35*e2**3/3072) * math.sin(6*lat)
    )

    k0 = 1.0 
    
    easting = k0 * N * (A + (1-T+C)*A**3/6 + (5-18*T+T**2+72*C-58*ep2)*A**5/120) + 500000.0
    northing = k0 * (M + N*math.tan(lat)*(A**2/2 + (5-T+9*C+4*C**2)*A**4/24 + (61-58*T+T**2+600*C-330*ep2)*A**6/720))

    return easting, northing

def universal_helmert_transformation(x, y, z, tx, ty, tz, rx, ry, rz, scale_ppm):
    P_old = np.array([[x], [y], [z]])
    T = np.array([[tx], [ty], [tz]])
    
    sec_to_rad = np.pi / (180 * 3600)
    rx_rad, ry_rad, rz_rad = rx * sec_to_rad, ry * sec_to_rad, rz * sec_to_rad
    
    R = np.array([
        [1, -rz_rad, ry_rad],
        [rz_rad, 1, -rx_rad],
        [-ry_rad, rx_rad, 1]
    ])
    
    S = 1 + (scale_ppm / 1000000.0)
    P_new = T + S * np.dot(R, P_old)
    
    return float(P_new[0][0]), float(P_new[1][0]), float(P_new[2][0])

def run_local_gnss_engine(obs_file_path: str, nav_file_paths: list, sp3_file_path: str = None):
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        rtklib_exe = os.path.join(base_dir, "rtklib", "rnx2rtkp.exe")
        
        if not os.path.exists(rtklib_exe):
            print(f"HATA: RTKLIB exe bulunamadı! Yol: {rtklib_exe}")
            return None, None, None, "Sistem Hatası: rnx2rtkp.exe bulunamadı."

        output_pos_file = obs_file_path + ".pos"
        
        mode = "PPP (Precise)" if sp3_file_path else "SPP (Standard)"
        p_val = "6" if sp3_file_path else "0"
        
        command = [rtklib_exe, "-p", p_val, "-e", "-y", "2", "-o", output_pos_file, obs_file_path]
        
        for nav in nav_file_paths:
            command.append(nav)
            
        if sp3_file_path:
            command.append(sp3_file_path)

        print(f"[RTKLIB] Çalıştırılan Komut: {' '.join(command)}")
        
        process = subprocess.run(command, capture_output=True, text=True)
        
        if process.returncode != 0:
            hata_mesaji = process.stderr.strip() if process.stderr else process.stdout.strip()
            print(f"RTKLIB Çöktü/Hata Döndürdü: {hata_mesaji}")
            return None, None, None, f"RTKLIB Çalışma Hatası: {hata_mesaji}"
            
        if os.path.exists(output_pos_file):
            with open(output_pos_file, 'r') as f:
                lines = f.readlines()
                
            data_lines = [line for line in lines if not line.startswith('%')]
            
            if data_lines:
                last_line = data_lines[-1].split()
                
                raw_x = float(last_line[2])
                raw_y = float(last_line[3])
                raw_z = float(last_line[4])
                
                print(f"[RTKLIB] Başarılı Gerçek Çözüm! X:{raw_x}, Y:{raw_y}, Z:{raw_z}")
                return raw_x, raw_y, raw_z, mode
            else:
                hata_sebebi = "Dosya boş, uydu verisi yetersiz."
                for line in lines:
                    if "error" in line.lower() or "warning" in line.lower():
                        hata_sebebi = line.replace('%', '').strip()
                        break
                        
                print(f"RTKLIB çözüm üretemedi: {hata_sebebi}")
                return None, None, None, f"Hesaplama Başarısız: {hata_sebebi}"
        else:
            print("RTKLIB çıktı (.pos) dosyasını oluşturamadı. (Sessiz Çöküş)")
            hata_mesaji = process.stderr.strip() if process.stderr else process.stdout.strip()
            return None, None, None, f"Çıktı dosyası oluşmadı. Terminal Çıktısı: {hata_mesaji}"

    except Exception as e:
        print(f"Lokal GNSS Motoru Kritik Hatası: {e}")
        return None, None, None, f"Python Sistem Hatası: {str(e)}"

@app.post("/api/process-full-gnss-pipeline")
async def process_full_gnss_pipeline(
    files: List[UploadFile] = File(...),
    obs_epoch: float = Form(2026.17),
    dom: int = Form(33), 
    tx: float = Form(-1.566),
    ty: float = Form(-0.273),
    tz: float = Form(-1.385),
    rx: float = Form(0.0),
    ry: float = Form(0.0),
    rz: float = Form(0.0),
    scale_ppm: float = Form(0.0)
):
    print(f"\n[+] LOKAL GNSS İŞLEMİ BAŞLADI (Ölçüm Epoğu: {obs_epoch}, DOM: {dom})")
    
    temp_dir = tempfile.mkdtemp()
    obs_path = None
    nav_paths = []
    sp3_path = None
    
    for file in files:
        file_ext = file.filename.lower()
        temp_file_path = os.path.join(temp_dir, file.filename)
        
        with open(temp_file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
            
        if file_ext.endswith(('o', 'obs', '26o')):
            obs_path = temp_file_path
        elif file_ext.endswith(('n', 'g', '26n', '26g', 'nav')):
            nav_paths.append(temp_file_path)
        elif file_ext.endswith(('sp3', 'eph')):
            sp3_path = temp_file_path

    if not obs_path:
        shutil.rmtree(temp_dir)
        raise HTTPException(status_code=400, detail="Hata: İşlem için en az bir Gözlem (.O) dosyası gereklidir.")

    print("[+] Dosyalar ayrıştırıldı, Lokal GNSS Motoru (SPP/PPP) tetikleniyor...")
    itrf_x, itrf_y, itrf_z, processing_mode = run_local_gnss_engine(obs_path, nav_paths, sp3_path)
    
    shutil.rmtree(temp_dir)

    if not itrf_x:
        raise HTTPException(status_code=500, detail=f"Lokal Çözüm Hatası: {processing_mode}")

    print(f"[+] Aşama 1: Lokal Çözüm ({processing_mode}) Tamamlandı. X:{itrf_x:.3f}, Y:{itrf_y:.3f}, Z:{itrf_z:.3f}")
    
    itrf96_x, itrf96_y, itrf96_z = universal_helmert_transformation(
        itrf_x, itrf_y, itrf_z, tx, ty, tz, rx, ry, rz, scale_ppm
    )
    print("[+] Aşama 2: ITRF96 Datumuna Helmert Dönüşümü Tamamlandı.")
    
    calc_vx, calc_vy, calc_vz, used_stations = calculate_weighted_velocities(itrf96_x, itrf96_y, itrf96_z)
    
    target_epoch = 2005.0
    delta_t = target_epoch - obs_epoch 
    
    turef_x = itrf96_x + (calc_vx * delta_t)
    turef_y = itrf96_y + (calc_vy * delta_t)
    turef_z = itrf96_z + (calc_vz * delta_t)
    print(f"[+] Aşama 3: TUSAGA Hızlarıyla 2005.0 Epoğuna Kaydırma Tamamlandı (Δt: {delta_t:.2f} yıl).")
    
    lat, lon, h = cartesian_to_geo(turef_x, turef_y, turef_z)
    easting, northing = geo_to_utm_3degree(lat, lon, dom)
    print(f"[+] Aşama 4: UTM Dönüşümü Tamamlandı (DOM: {dom} | Sağa: {easting:.3f}, Yukarı: {northing:.3f})")

    return {
        "status": "success",
        "processed_files": [f.filename for f in files],
        "processing_mode": processing_mode,
        "interpolation": {
            "vx": round(calc_vx, 6),
            "vy": round(calc_vy, 6),
            "vz": round(calc_vz, 6),
            "stations": used_stations
        },
        "stages": {
            "step_1_itrf": {"name": f"1. Lokal Çözüm ({processing_mode})", "x": f"{itrf_x:.3f}", "y": f"{itrf_y:.3f}", "z": f"{itrf_z:.3f}"},
            "step_2_itrf96": {"name": "2. ITRF96 Koordinatları (Helmert)", "x": f"{itrf96_x:.3f}", "y": f"{itrf96_y:.3f}", "z": f"{itrf96_z:.3f}"},
            "step_3_turef": {"name": "3. TUREF Koordinatları (2005.0)", "x": f"{turef_x:.3f}", "y": f"{turef_y:.3f}", "z": f"{turef_z:.3f}"},
            "step_4_utm": {
                "name": f"4. UTM Koordinatları (3 Derece / DOM {dom})",
                "lat": f"{lat:.6f}°", "lon": f"{lon:.6f}°", "h": f"{h:.3f} m",
                "easting": f"{easting:.3f} m", "northing": f"{northing:.3f} m"
            }
        }
    }
@echo off
title GeoNexusAI Akilli Baslatici
echo GeoNexusAI sistemleri kontrol ediliyor, lutfen bekleyin...

:: 1. Python Backend Kontrolu ve Baslatma

cd server
IF NOT EXIST venv (
    echo [ILK KURULUM] GeoNexusAI Backend kutuphaneleri indiriliyor...
    python -m venv venv
    call venv\Scripts\activate
    pip install -r requirements.txt
) ELSE (
    call venv\Scripts\activate
)
echo Backend baslatiliyor...
start "GeoNexusAI Backend (Python)" cmd /k "python main.py"
cd ..

:: 2. React Frontend Kontrolu ve Baslatma
cd client
IF NOT EXIST node_modules (
    echo [ILK KURULUM] GeoNexusAI Frontend kutuphaneleri indiriliyor (Biraz surebilir)...
    npm install
)
echo Frontend (Localhost) baslatiliyor...
start "GeoNexusAI Frontend (React)" cmd /k "npm start"
cd ..

echo GeoNexusAI basariyla calistirildi! Tarayicinizda proje aciliyor...
pause >nul
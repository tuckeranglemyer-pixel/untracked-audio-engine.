const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// --- 1. Python Analysis Script (V3: THE PRECISION UPDATE) ---
const pythonScriptPath = path.join(__dirname, 'analyze.py');
const pythonScriptContent = `
import sys
import json
import librosa
import numpy as np
import warnings

# Suppress warnings to keep JSON output clean
warnings.filterwarnings('ignore')

try:
    file_path = sys.argv[1]
    
    # Load 30 seconds (Standard for EDM/Pop)
    y, sr = librosa.load(file_path, duration=30)
    
    # --- PRO LOGIC: HPSS SEPARATION ---
    # We split the audio into "Melodic" and "Percussive" layers.
    # Analyzing BPM on the percussive layer only is MUCH more accurate for House/EDM.
    y_harmonic, y_percussive = librosa.effects.hpss(y)
    
    # BPM DETECTION
    onset_env = librosa.onset.onset_strength(y=y_percussive, sr=sr)
    
    # tightness=100 forces the algorithm to stay on a strict grid (Essential for DJs)
    # start_bpm=128 pulls ambiguous results toward the House/Pop range
    tempo, _ = librosa.beat.beat_track(
        onset_envelope=onset_env, 
        sr=sr, 
        start_bpm=128,
        tightness=100 
    )
    
    # KEY DETECTION (Performed on the Harmonic layer for better pitch clarity)
    chroma = librosa.feature.chroma_cqt(y=y_harmonic, sr=sr)
    key_index = np.argmax(np.sum(chroma, axis=1))
    pitches = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    
    print(json.dumps({
        "bpm": round(float(tempo), 1),
        "key": pitches[key_index],
        "version": "v3_PRECISION" 
    }))

except Exception as e:
    print(json.dumps({"error": str(e)}))
`;
fs.writeFileSync(pythonScriptPath, pythonScriptContent);

// --- 2. Helper Function to Run Commands ---
const runCommand = (command, args) => {
    return new Promise((resolve, reject) => {
        const process = spawn(command, args);
        let stdoutData = '';
        let stderrData = '';

        process.stdout.on('data', (data) => { stdoutData += data.toString(); });
        process.stderr.on('data', (data) => { 
            const chunk = data.toString();
            stderrData += chunk; 
            console.log(chunk); 
        });

        process.on('close', (code) => {
            if (code === 0) resolve(stdoutData);
            else reject(new Error(stderrData));
        });
        
        // Timeout: 3 Minutes (Required for Render Starter Plan)
        setTimeout(() => {
            process.kill();
            reject(new Error("Timeout: Process took longer than 3 minutes"));
        }, 180000);
    });
};

// --- 3. API Route ---
app.post('/analyze', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "No URL provided" });

    const cleanUrl = url.split('?')[0];
    const tempId = uuidv4();
    const tempFile = path.join(__dirname, `${tempId}.mp3`);

    console.log(`Starting Process for: ${cleanUrl}`);

    try {
        console.log("...Downloading");
        await runCommand('yt-dlp', [
            '-x', '--audio-format', 'mp3',
            '--no-playlist',
            '--force-ipv4',
            '--no-check-certificate', 
            '--prefer-free-formats',
            '-o', tempFile,
            cleanUrl
        ]);

        console.log("...Analyzing");
        const analysisOutput = await runCommand('python3', [pythonScriptPath, tempFile]);

        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

        const jsonStr = analysisOutput.trim().split('\n').pop();
        const data = JSON.parse(jsonStr);
        
        console.log("Success:", data);
        res.json(data);

    } catch (error) {
        console.error("FAILED:", error.message);
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        
        res.status(500).json({ 
            error: "Process Failed", 
            details: error.message.substring(0, 100) 
        });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Audio Engine Live on ${PORT}`));

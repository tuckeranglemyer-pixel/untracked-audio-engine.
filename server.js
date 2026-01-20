const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// --- 1. Python Analysis Script ---
const pythonScriptPath = path.join(__dirname, 'analyze.py');
const pythonScriptContent = `
import sys
import json
import librosa
import numpy as np
import warnings

warnings.filterwarnings('ignore')

try:
    file_path = sys.argv[1]
    y, sr = librosa.load(file_path, duration=60)
    
    # BPM
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
    
    # Key
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key_index = np.argmax(np.sum(chroma, axis=1))
    pitches = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    
    print(json.dumps({
        "bpm": round(float(tempo), 1),
        "key": pitches[key_index],
        "genre": "House"
    }))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;
fs.writeFileSync(pythonScriptPath, pythonScriptContent);

// --- 2. Helper Function to Run Commands (Prevents Hanging) ---
const runCommand = (command, args) => {
    return new Promise((resolve, reject) => {
        const process = spawn(command, args);
        let stdoutData = '';
        let stderrData = '';

        process.stdout.on('data', (data) => { stdoutData += data.toString(); });
        process.stderr.on('data', (data) => { 
            const chunk = data.toString();
            stderrData += chunk; 
            console.log(chunk); // Stream logs to console so we see them LIVE
        });

        process.on('close', (code) => {
            if (code === 0) resolve(stdoutData);
            else reject(new Error(stderrData));
        });
        
        // Timeout after 60 seconds to prevent infinite hanging
        setTimeout(() => {
            process.kill();
            reject(new Error("Timeout: Process took too long"));
        }, 60000);
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
        // Step A: Download (Using Spawn + Anti-Hang Flags)
        console.log("...Downloading");
        await runCommand('yt-dlp', [
            '-x', '--audio-format', 'mp3',
            '--no-playlist',
            '--force-ipv4',      // Fixes Render Network Issues
            '--no-check-certificate', // Fixes SSL Handshake Hangs
            '-o', tempFile,
            cleanUrl
        ]);

        // Step B: Analyze
        console.log("...Analyzing");
        const analysisOutput = await runCommand('python3', [pythonScriptPath, tempFile]);

        // Cleanup
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

        // Parse JSON
        const jsonStr = analysisOutput.trim().split('\n').pop();
        const data = JSON.parse(jsonStr);
        
        console.log("Success:", data);
        res.json(data);

    } catch (error) {
        console.error("FAILED:", error.message);
        // Ensure cleanup happens even on error
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        
        res.status(500).json({ 
            error: "Process Failed", 
            details: error.message.substring(0, 100) 
        });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Audio Engine Live on ${PORT}`));

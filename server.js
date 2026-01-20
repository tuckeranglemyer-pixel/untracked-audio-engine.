const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
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

# Suppress warnings to keep JSON output clean
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

// --- 2. API Route ---
app.post('/analyze', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "No URL provided" });

    // Clean the URL (Remove ?si= tracking junk)
    const cleanUrl = url.split('?')[0];
    
    const tempId = uuidv4();
    const tempFile = path.join(__dirname, `${tempId}.mp3`);

    console.log(`Processing: ${cleanUrl}`);

    // THE FIX: Added User-Agent to trick SoundCloud
    const userAgent = '"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"';
    const command = `yt-dlp -x --audio-format mp3 --no-playlist --user-agent ${userAgent} -o "${tempFile}" "${cleanUrl}"`;

    // Step A: Download
    exec(command, (err, stdout, stderr) => {
        if (err) {
            console.error("Download Error:", stderr); // Now we see the real error
            return res.status(500).json({ error: "Download failed (Blocked by SoundCloud?)" });
        }

        // Step B: Analyze
        exec(`python3 "${pythonScriptPath}" "${tempFile}"`, (pErr, pStdout, pStderr) => {
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); // Cleanup

            if (pErr) {
                console.error("Analysis Error:", pStderr);
                return res.status(500).json({ error: "Analysis failed" });
            }

            try {
                // Find the JSON part of the output (ignores any other logs)
                const jsonStr = pStdout.trim().split('\n').pop();
                const data = JSON.parse(jsonStr);
                res.json(data);
            } catch (e) {
                console.error("JSON Parse Error:", pStdout);
                res.status(500).json({ error: "Invalid Data from Analyzer" });
            }
        });
    });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Audio Engine Live on ${PORT}`));

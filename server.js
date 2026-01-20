const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors()); // Allows your frontend to talk to this
app.use(express.json());

// 1. The Python Script (Embedded as a string)
const pythonScriptPath = path.join(__dirname, 'analyze.py');
const pythonScriptContent = `
import sys
import json
import librosa
import numpy as np

try:
    file_path = sys.argv[1]
    # Load 60s of audio to speed it up
    y, sr = librosa.load(file_path, duration=60)
    
    # BPM
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
    
    # Key (Simple Estimation)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key_index = np.argmax(np.sum(chroma, axis=1))
    pitches = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    
    print(json.dumps({
        "bpm": round(float(tempo), 1),
        "key": pitches[key_index],
        "genre": "House" # Placeholder for now
    }))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;

// Write the python script to disk on startup
fs.writeFileSync(pythonScriptPath, pythonScriptContent);

// 2. The API Route
app.post('/analyze', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "No URL provided" });

    const tempId = uuidv4();
    const tempFile = path.join(__dirname, `${tempId}.mp3`);

    console.log(`Downloading: ${url}`);

    // Step A: Download with yt-dlp (System command)
    // We use the 'yt-dlp' installed by Python in the Dockerfile
    exec(`yt-dlp -x --audio-format mp3 -o "${tempFile}" "${url}"`, (err, stdout, stderr) => {
        if (err) {
            console.error(stderr);
            return res.status(500).json({ error: "Download failed" });
        }

        // Step B: Analyze with Python
        exec(`python3 "${pythonScriptPath}" "${tempFile}"`, (pErr, pStdout, pStderr) => {
            // Cleanup file to save space
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

            if (pErr) {
                console.error(pStderr);
                return res.status(500).json({ error: "Analysis failed" });
            }

            try {
                const data = JSON.parse(pStdout);
                res.json(data);
            } catch (e) {
                res.status(500).json({ error: "Invalid JSON from Python" });
            }
        });
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Audio Engine running on port ${PORT}`));

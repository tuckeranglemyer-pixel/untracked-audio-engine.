# Use a lightweight base image with Python and Node.js
FROM nikolaik/python-nodejs:python3.9-nodejs18

# 1. Install System Dependencies (FFmpeg is required for audio)
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# 2. Set the working directory
WORKDIR /app

# 3. Install Python Dependencies
# FIX: We pin scipy==1.12.0 because the newer versions break Librosa
RUN pip3 install --no-cache-dir -U \
    yt-dlp \
    librosa \
    numpy==1.26.4 \
    scipy==1.12.0

# 4. Copy Node Dependencies & Install
COPY package.json ./
# We removed the 'yt-dlp-exec' wrapper to prevent build crashes
RUN npm install

# 5. Copy the rest of the code
COPY . .

# 6. Expose the port
EXPOSE 10000

# 7. Start the server
CMD ["node", "server.js"]

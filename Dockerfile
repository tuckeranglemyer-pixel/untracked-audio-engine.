# Start with Node.js (Debian Bullseye)
FROM node:18-bullseye

# 1. Install System Dependencies
# Added: 'libsndfile1' (Required for Audio) and 'build-essential' (Required for Pip)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Set Working Directory
WORKDIR /app

# 2. Upgrade Pip (Crucial step to avoid compiling from source)
RUN pip3 install --no-cache-dir --upgrade pip setuptools wheel

# 3. Copy Requirements & Install
COPY requirements.txt ./
# Added: --only-binary to force downloading pre-built wheels (saves memory)
RUN pip3 install -r requirements.txt --break-system-packages --only-binary=:all: || \
    pip3 install -r requirements.txt --break-system-packages

# 4. Copy Node Dependencies & Install
COPY package.json ./
RUN npm install

# Copy the rest of the code
COPY . .

# Expose the port
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]

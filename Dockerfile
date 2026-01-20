# Start with Node.js (Official Image)
FROM node:18-bullseye

# Install Python 3, pip, and FFmpeg (System Level)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set Working Directory
WORKDIR /app

# Copy Python Requirements & Install
COPY requirements.txt ./
RUN pip3 install -r requirements.txt --break-system-packages

# Copy Node Dependencies & Install
COPY package.json ./
RUN npm install

# Copy the rest of the code
COPY . .

# Expose the port
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]

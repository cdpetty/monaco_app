# Stage 1: Build frontend
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npx vite build

# Stage 2: Python backend + serve frontend
FROM python:3.11-slim
WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./

# Copy frontend build into static directory
COPY --from=frontend-build /app/frontend/dist ./static

EXPOSE 8000

CMD ["python", "main.py"]

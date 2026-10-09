FROM python:3.11-slim-bookworm
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.lock.txt ./requirements.lock.txt
RUN pip install --no-cache-dir -r requirements.lock.txt
COPY backend ./backend
RUN useradd --uid 1001 --create-home risklens && mkdir -p /data && chown -R risklens:risklens /data /app
ENV RISKLENS_ENV=production RISKLENS_PROVIDER=local RISKLENS_ENABLE_VERTEX=false RISKLENS_STORAGE_DIR=/data
USER risklens
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=4)"
CMD ["sh", "-c", "python -m backend.migrate && exec uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-8000}"]

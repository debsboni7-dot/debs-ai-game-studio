FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /opt/debs-training
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home --uid 10002 debstrainer
COPY --chown=debstrainer:debstrainer . .
USER debstrainer
CMD ["python", "worker.py", "--loop"]

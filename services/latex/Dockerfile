FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 texlive-latex-base texlive-latex-recommended texlive-latex-extra texlive-extra-utils \
    texlive-lang-cyrillic texlive-science texlive-pictures texlive-fonts-recommended \
    asymptote cm-super ghostscript poppler-utils && rm -rf /var/lib/apt/lists/*
COPY render.py /opt/render.py
ENV HOME=/work TEXMFOUTPUT=/work openin_any=p openout_any=p
WORKDIR /work
USER 65534:65534
ENTRYPOINT ["python3", "/opt/render.py"]

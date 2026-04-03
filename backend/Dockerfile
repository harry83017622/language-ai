FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install ffmpeg and download fonts:
# - NotoSansCJKtc: Chinese characters
# - NotoSans static: Latin + IPA phonetic symbols (static weight, not variable)
RUN mkdir -p /app/fonts && \
    apt-get update && apt-get install -y --no-install-recommends wget ca-certificates ffmpeg fonts-noto-core && \
    wget -q -O /app/fonts/NotoSansTC-Regular.otf "https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf" && \
    cp /usr/share/fonts/truetype/noto/NotoSans-Regular.ttf /app/fonts/NotoSans-Regular.ttf && \
    apt-get purge -y wget && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

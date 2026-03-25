# English Vocab Tool

輔助背英文單字的全端應用，透過 LLM 自動生成中文翻譯、KK 音標、例句、諧音記憶，並儲存至 PostgreSQL。

## 技術棧

- **Frontend**: React + TypeScript + Vite + Ant Design
- **Backend**: Python FastAPI + SQLAlchemy (async) + asyncpg
- **Database**: PostgreSQL 16
- **LLM**: OpenAI gpt-5.4
- **TTS**: OpenAI TTS API
- **DB Migration**: Alembic
- **部署**: Docker Compose

## 功能總覽

| 頁面 | 路由 | 說明 |
|------|------|------|
| 新增單字 | `#/create` | 輸入英文單字或上傳 CSV，LLM 生成中文、KK 音標、例句、諧音 |
| 歷史紀錄 | `#/history` | 瀏覽/編輯/下載（CSV/PDF）已儲存的單字組，勾選單字生成複習 MP4 |
| 搜尋單字 | `#/search` | 模糊搜尋所有已儲存的單字，顯示來源標題和日期 |
| 文章生成 | `#/article` | 用單字生成英文文章或對話，可下載 MP3/MP4，可儲存/載入 |
| 複習 | `#/review` | Flashcard 翻牌複習，加權抽取（忘記的更常出現），複習統計 |

## 如何啟動

### 1. 設定環境變數

```bash
cp .env.example .env
```

編輯 `.env`，填入你的 OpenAI API Key、Google OAuth Client ID、JWT Secret：

```
OPENAI_API_KEY=sk-your-key-here
GOOGLE_CLIENT_ID=your-google-client-id-here
JWT_SECRET_KEY=change-me-to-a-random-secret-string-at-least-32-chars
```

前端也需要設定 Google Client ID：

```bash
echo "VITE_GOOGLE_CLIENT_ID=your-google-client-id-here" > frontend/.env
```

### 2. Docker Compose 啟動（推薦）

```bash
docker-compose up --build
```

- 前端：http://localhost:3000
- 後端 API：http://localhost:8000
- Swagger 文件：http://localhost:8000/docs

> DB 資料使用 named volume `pgdata` 持久化，`docker-compose down` **不會**刪除資料。
> 只有 `docker-compose down -v` 才會清除 volume。

### 3. 開發模式（不用 Docker 跑前後端）

先用 Docker 起 PostgreSQL：

```bash
docker-compose up db
```

啟動 Backend：

```bash
cd backend
pip install -r requirements.txt
OPENAI_API_KEY=sk-xxx uvicorn app.main:app --reload
```

啟動 Frontend：

```bash
cd frontend
npm install
npm run dev
```

## DB Schema 變更（Alembic Migration）

當需要修改資料庫結構（加欄位、新增表等）：

1. **修改 Model** — 編輯 `backend/app/models.py`
2. **產生 Migration** —
   ```bash
   docker-compose exec backend alembic revision --autogenerate -m "describe your change"
   ```
3. **重啟服務** — 啟動時會自動執行 `alembic upgrade head`
   ```bash
   docker-compose down && docker-compose up --build
   ```

> 資料不受影響，不需要 `-v` 刪除 volume。
> Migration 檔案在 `backend/alembic/versions/`，需一併 commit 進版控。

## 使用流程

### 新增單字
1. 進入「新增單字」頁面（`#/create`），輸入英文單字或上傳 CSV
2. 勾選每個單字需要生成的欄位（中文、KK 音標、例句、故事）
3. 按下「送出生成」，LLM 批次生成內容（先查 DB 已有的，缺的才跑 LLM）
4. 諧音會生成 3 個選項，用 checkbox 複選，也可手動輸入
5. 輸入標題與日期後，按下「儲存到資料庫」

### 歷史紀錄
- 依標題、日期範圍搜尋已儲存的單字組（`#/history`）
- 編輯任意欄位並儲存
- 下載 CSV 或 PDF
- 勾選單字生成複習 MP4（黑底白字，TTS 發音）

### 搜尋單字
- 輸入至少 4 個字母模糊搜尋（`#/search`）
- 顯示單字完整資訊及來源（標題、日期）

### 文章生成
- 輸入多個單字，選擇文章或對話模式（`#/article`）
- 設定單字使用比例（10%-100%）
- 生成後可下載 MP3（對話模式有不同聲音）或 MP4（字幕同步語音）
- 可儲存文章，下次載入還原

### 複習
- Flashcard 翻牌模式（`#/review`），空白鍵翻牌，← 記得 / ↑ 不確定 / → 忘記
- 加權隨機抽取：忘記的單字出現機率更高
- 複習統計：查看記得/不確定/忘記的單字（本週/本月/本季/歷史）
- Hover 單字可查看 KK 音標和諧音

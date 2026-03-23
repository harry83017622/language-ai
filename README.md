# English Vocab Tool

輔助背英文單字的全端應用，透過 LLM 自動生成中文翻譯、KK 音標、例句、諧音記憶，並儲存至 PostgreSQL。

## 技術棧

- **Frontend**: React + TypeScript + Vite + Ant Design
- **Backend**: Python FastAPI + SQLAlchemy (async) + asyncpg
- **Database**: PostgreSQL 16
- **LLM**: OpenAI gpt-5.4
- **DB Migration**: Alembic
- **部署**: Docker Compose

## 如何啟動

### 1. 設定環境變數

```bash
cp .env.example .env
```

編輯 `.env`，填入你的 OpenAI API Key：

```
OPENAI_API_KEY=sk-your-key-here
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

1. 進入「新增單字」頁面，輸入一或多個英文單字
2. 勾選每個單字需要生成的欄位（中文、KK 音標、例句、諧音）
3. 按下「送出生成」，LLM 會批次生成內容
4. 結果以可編輯表格呈現，可手動修改任意格子
5. 輸入標題與日期後，按下「儲存到資料庫」
6. 在「歷史紀錄」頁面可依標題、日期範圍搜尋已儲存的單字組

import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8000/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export interface WordGenerateRequest {
  english: string;
  need_chinese: boolean;
  need_kk: boolean;
  need_example: boolean;
  need_mnemonic: boolean;
}

export interface WordResult {
  key?: string;
  english: string;
  chinese: string | null;
  kk_phonetic: string | null;
  example_sentence: string | null;
  mnemonic: string | null;
  mnemonic_options?: string[] | null;
}

export interface WordGroupSummary {
  id: string;
  title: string;
  saved_date: string;
  created_at: string;
  word_count: number;
}

export interface WordOut {
  id: string;
  english: string;
  chinese: string | null;
  kk_phonetic: string | null;
  mnemonic: string | null;
  example_sentence: string | null;
  sort_order: number;
  marked_for_review: boolean;
}

export interface WordGroupOut {
  id: string;
  title: string;
  saved_date: string;
  created_at: string;
  words: WordOut[];
}

export async function generateWords(words: WordGenerateRequest[]): Promise<WordResult[]> {
  const res = await api.post("/generate", { words });
  return res.data.results;
}

export async function saveWordGroup(data: {
  title: string;
  saved_date: string;
  words: {
    english: string;
    chinese?: string | null;
    kk_phonetic?: string | null;
    mnemonic?: string | null;
    example_sentence?: string | null;
    sort_order: number;
  }[];
}): Promise<WordGroupOut> {
  const res = await api.post("/word-groups", data);
  return res.data;
}

export async function listWordGroups(params?: {
  title?: string;
  date_from?: string;
  date_to?: string;
}): Promise<WordGroupSummary[]> {
  const res = await api.get("/word-groups", { params });
  return res.data;
}

export async function getWordGroup(id: string): Promise<WordGroupOut> {
  const res = await api.get(`/word-groups/${id}`);
  return res.data;
}

export async function updateWord(
  wordId: string,
  data: Partial<Pick<WordOut, "english" | "chinese" | "kk_phonetic" | "mnemonic" | "example_sentence">>
): Promise<WordOut> {
  const res = await api.put(`/words/${wordId}`, data);
  return res.data;
}

export async function deleteWordGroup(id: string): Promise<void> {
  await api.delete(`/word-groups/${id}`);
}

export interface CsvUploadResponse {
  words: WordResult[];
  detected_columns: Record<string, string>;
}

export async function uploadCsv(file: File): Promise<CsvUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post("/upload-csv", formData);
  return res.data;
}

export interface WordSearchResult extends WordOut {
  group_title: string;
  group_saved_date: string;
}

export async function searchWords(q: string): Promise<WordSearchResult[]> {
  const res = await api.get("/search-words", { params: { q } });
  return res.data;
}

// --- Article ---

export interface ArticleSentence {
  speaker: string | null;
  text: string;
}

export interface GenerateArticleResponse {
  title: string;
  sentences: ArticleSentence[];
  used_words: string[];
}

export async function generateArticle(data: {
  words: string[];
  mode: string;
  ratio: number;
}): Promise<GenerateArticleResponse> {
  const res = await api.post("/generate-article", data);
  return res.data;
}

export async function downloadAudio(sentences: ArticleSentence[]): Promise<Blob> {
  const res = await api.post("/generate-audio", { sentences }, { responseType: "blob" });
  return res.data;
}

export async function downloadVideo(sentences: ArticleSentence[]): Promise<Blob> {
  const res = await api.post("/generate-video", { sentences }, { responseType: "blob", timeout: 300000 });
  return res.data;
}

export async function batchMarkWords(wordIds: string[], marked: boolean): Promise<void> {
  await api.put("/words/batch-mark", { word_ids: wordIds, marked });
}

export interface ReviewVideoWord {
  english: string;
  chinese: string | null;
  kk_phonetic: string | null;
  mnemonic: string | null;
}

export async function generateReviewVideo(words: ReviewVideoWord[]): Promise<Blob> {
  const res = await api.post("/generate-review-video", { words }, { responseType: "blob", timeout: 600000 });
  return res.data;
}

export interface ArticleSummary {
  id: string;
  title: string;
  mode: string;
  created_at: string;
}

export interface ArticleDetail extends GenerateArticleResponse {
  id: string;
  input_words: string[];
  mode: string;
  ratio: number;
  created_at: string;
}

export async function saveArticle(data: {
  title: string;
  input_words: string[];
  mode: string;
  ratio: number;
  sentences: ArticleSentence[];
  used_words: string[];
}): Promise<ArticleDetail> {
  const res = await api.post("/articles", data);
  return res.data;
}

export async function listArticles(): Promise<ArticleSummary[]> {
  const res = await api.get("/articles");
  return res.data;
}

export async function getArticle(id: string): Promise<ArticleDetail> {
  const res = await api.get(`/articles/${id}`);
  return res.data;
}

export async function deleteArticle(id: string): Promise<void> {
  await api.delete(`/articles/${id}`);
}

// --- Review ---

export interface ReviewWord {
  id: string;
  english: string;
  chinese: string | null;
  kk_phonetic: string | null;
  mnemonic: string | null;
  example_sentence: string | null;
}

export async function getReviewWords(source: string, count: number): Promise<ReviewWord[]> {
  const res = await api.get("/review/words", { params: { source, count } });
  return res.data;
}

export async function logReview(wordId: string, result: string): Promise<void> {
  await api.post("/review/log", { word_id: wordId, result });
}

export interface ReviewWordStat {
  english: string;
  chinese: string | null;
  kk_phonetic: string | null;
  mnemonic: string | null;
  count: number;
}

export interface TimePeriodStats {
  week: ReviewWordStat[];
  month: ReviewWordStat[];
  quarter: ReviewWordStat[];
  all: ReviewWordStat[];
}

export interface ReviewStats {
  total_reviews: number;
  remember_count: number;
  unsure_count: number;
  forget_count: number;
  remember_words: TimePeriodStats;
  unsure_words: TimePeriodStats;
  forget_words: TimePeriodStats;
}

export async function getReviewStats(): Promise<ReviewStats> {
  const res = await api.get("/review/stats");
  return res.data;
}

export default api;

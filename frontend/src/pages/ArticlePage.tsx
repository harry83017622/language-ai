import { useEffect, useState } from "react";
import dayjs from "dayjs";
import {
  Button,
  Card,
  Input,
  List,
  message,
  Modal,
  Select,
  Slider,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  AudioOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FolderOpenOutlined,
  PlaySquareOutlined,
  SaveOutlined,
  SendOutlined,
} from "@ant-design/icons";
import type { ArticleSentence, ArticleSummary, GenerateArticleResponse } from "../api";
import { downloadBlob } from "../utils/download";
import { SPEAKER_COLORS } from "../utils/labels";
import api, {
  generateArticle,
  downloadAudio,
  downloadVideo,
  saveArticle,
  listArticles,
  getArticle,
  deleteArticle,
} from "../api";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export default function ArticlePage() {
  const [wordsText, setWordsText] = useState("");
  const [mode, setMode] = useState<"article" | "dialogue">("article");
  const [ratio, setRatio] = useState(90);
  const [loading, setLoading] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<GenerateArticleResponse | null>(null);

  // Saved articles
  const [savedList, setSavedList] = useState<ArticleSummary[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [listLoading, setListLoading] = useState(false);

  const handleGenerate = async () => {
    const words = wordsText
      .split("\n")
      .map((w) => w.trim())
      .filter(Boolean);
    if (!words.length) {
      message.warning("請輸入至少一個日文單字");
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const data = await generateArticle({ words, mode, ratio: ratio / 100 });
      setResult(data);
      message.success("文章生成完成！");
    } catch (e: any) {
      message.error("生成失敗：" + (e?.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    const words = wordsText.split("\n").map((w) => w.trim()).filter(Boolean);
    setSaving(true);
    try {
      await saveArticle({
        title: result.title,
        input_words: words,
        mode,
        ratio: ratio / 100,
        sentences: result.sentences,
        used_words: result.used_words,
      });
      message.success("儲存成功！");
    } catch (e: any) {
      message.error("儲存失敗：" + (e?.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  };

  const handleOpenList = async () => {
    setListOpen(true);
    setListLoading(true);
    try {
      const data = await listArticles();
      setSavedList(data);
    } catch {
      message.error("載入失敗");
    } finally {
      setListLoading(false);
    }
  };

  const handleLoad = async (id: string) => {
    try {
      const data = await getArticle(id);
      setWordsText(data.input_words.join("\n"));
      setMode(data.mode as "article" | "dialogue");
      setRatio(Math.round(data.ratio * 100));
      setResult({
        title: data.title,
        sentences: data.sentences,
        used_words: data.used_words,
      });
      setListOpen(false);
      message.success("已載入");
    } catch {
      message.error("載入失敗");
    }
  };

  const handleDeleteArticle = async (id: string) => {
    try {
      await deleteArticle(id);
      setSavedList((prev) => prev.filter((a) => a.id !== id));
      message.success("已刪除");
    } catch {
      message.error("刪除失敗");
    }
  };

  const handleDownloadAudio = async () => {
    if (!result) return;
    setAudioLoading(true);
    try {
      const blob = await downloadAudio(result.sentences);
      downloadBlob(blob, getArticleFilename("mp3"));
      message.success("MP3 下載完成！");
    } catch (e: any) {
      message.error("MP3 生成失敗：" + (e?.response?.data?.detail || e.message));
    } finally {
      setAudioLoading(false);
    }
  };

  const handleDownloadVideo = async () => {
    if (!result) return;
    setVideoLoading(true);
    try {
      const blob = await downloadVideo(result.sentences);
      downloadBlob(blob, getArticleFilename("mp4"));
      message.success("MP4 下載完成！");
    } catch (e: any) {
      message.error("MP4 生成失敗：" + (e?.response?.data?.detail || e.message));
    } finally {
      setVideoLoading(false);
    }
  };

  const getArticleFilename = (ext: string) => {
    const date = dayjs().format("YYYY-MM-DD");
    const title = result?.title ?? "article";
    return `${date}_${title}.${ext}`;
  };

  const getPlainText = () => {
    if (!result) return "";
    const fullTitle = `${dayjs().format("YYYY-MM-DD")} ${result.title}`;
    const header = `${fullTitle}\n${"=".repeat(fullTitle.length)}\n\n`;
    const body = result.sentences
      .map((s) => {
        const en = s.speaker ? `${s.speaker}: ${s.text}` : s.text;
        const zh = s.definition ? `   ${s.definition}` : "";
        return zh ? `${en}\n${zh}` : en;
      })
      .join("\n\n");
    return header + body;
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(getPlainText());
    message.success("已複製到剪貼簿");
  };

  const handleDownloadTxt = () => {
    if (!result) return;
    downloadBlob(new Blob([getPlainText()], { type: "text/plain;charset=utf-8" }), getArticleFilename("txt"));
  };

  const handleDownloadArticlePdf = async () => {
    if (!result) return;
    try {
      const res = await api.post(
        "/generate-article-pdf",
        { title: result.title, sentences: result.sentences, used_words: result.used_words },
        { responseType: "blob" }
      );
      downloadBlob(new Blob([res.data]), getArticleFilename("pdf"));
    } catch {
      message.error("PDF 下載失敗");
    }
  };

  const highlightText = (text: string) => {
    if (!result?.used_words?.length) return text;
    const pattern = new RegExp(
      `(${result.used_words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
      "gi"
    );
    const parts = text.split(pattern);
    return parts.map((part, i) => {
      if (result.used_words.some((w) => w.toLowerCase() === part.toLowerCase())) {
        return (
          <Text key={i} strong style={{ color: "#1890ff" }}>
            {part}
          </Text>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      <Space style={{ marginBottom: 16, width: "100%", justifyContent: "space-between" }}>
        <Title level={2} style={{ margin: 0 }}>文章生成</Title>
        <Button icon={<FolderOpenOutlined />} onClick={handleOpenList}>
          載入已儲存
        </Button>
      </Space>

      {/* Input */}
      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <TextArea
            placeholder={"輸入日文單字，每行一個\n例如：\n食べる\n勉強\n大切"}
            value={wordsText}
            onChange={(e) => setWordsText(e.target.value)}
            autoSize={{ minRows: 6, maxRows: 15 }}
          />
          <Space wrap>
            <span>模式：</span>
            <Select
              value={mode}
              onChange={setMode}
              style={{ width: 120 }}
              options={[
                { value: "article", label: "文章" },
                { value: "dialogue", label: "對話" },
              ]}
            />
            <span>單字使用比例：</span>
            <Slider
              value={ratio}
              onChange={setRatio}
              min={10}
              max={100}
              step={10}
              style={{ width: 200 }}
              tooltip={{ formatter: (v) => `${v}%` }}
            />
            <Text type="secondary">{ratio}%</Text>
          </Space>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleGenerate}
            loading={loading}
          >
            生成
          </Button>
        </Space>
      </Card>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin size="large" tip="文章生成中..." />
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <Card>
          <Title level={4}>{result.title}</Title>

          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">使用的單字：</Text>{" "}
            {result.used_words.map((w) => (
              <Tag color="blue" key={w}>
                {w}
              </Tag>
            ))}
          </div>

          <Card
            type="inner"
            style={{
              marginBottom: 16,
              background: "#fafafa",
              maxHeight: 400,
              overflow: "auto",
            }}
          >
            {result.sentences.map((s, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <Paragraph style={{ marginBottom: 2 }}>
                  {s.speaker && (
                    <Tag color={SPEAKER_COLORS[s.speaker] ?? "purple"}>
                      {s.speaker}
                    </Tag>
                  )}
                  {highlightText(s.text)}
                </Paragraph>
                {s.definition && (
                  <Text type="secondary" style={{ fontSize: 13, paddingLeft: s.speaker ? 32 : 0 }}>
                    {s.definition}
                  </Text>
                )}
              </div>
            ))}
          </Card>

          <Space>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saving}
            >
              儲存
            </Button>
            <Button
              icon={<AudioOutlined />}
              onClick={handleDownloadAudio}
              loading={audioLoading}
            >
              下載 MP3
            </Button>
            <Button
              icon={<PlaySquareOutlined />}
              onClick={handleDownloadVideo}
              loading={videoLoading}
            >
              下載 MP4
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleDownloadTxt}>
              下載 TXT
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleDownloadArticlePdf}>
              下載 PDF
            </Button>
            <Button icon={<CopyOutlined />} onClick={handleCopyText}>
              複製文字
            </Button>
          </Space>
        </Card>
      )}

      {/* Saved articles modal */}
      <Modal
        title="已儲存的文章"
        open={listOpen}
        onCancel={() => setListOpen(false)}
        footer={null}
        width={600}
      >
        <List
          loading={listLoading}
          dataSource={savedList}
          locale={{ emptyText: "還沒有儲存的文章" }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button size="small" type="link" onClick={() => handleLoad(item.id)}>
                  載入
                </Button>,
                <Button
                  size="small"
                  type="link"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDeleteArticle(item.id)}
                />,
              ]}
            >
              <List.Item.Meta
                title={item.title}
                description={
                  <Space>
                    <Tag>{item.mode === "article" ? "文章" : "對話"}</Tag>
                    <Text type="secondary">{new Date(item.created_at).toLocaleDateString()}</Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
}

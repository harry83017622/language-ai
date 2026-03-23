import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Dropdown,
  Input,
  message,
  Modal,
  Space,
  Table,
  Typography,
} from "antd";
import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlaySquareOutlined,
  SaveOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { WordGroupSummary, WordGroupOut, WordOut } from "../api";
import api, {
  batchMarkWords,
  deleteWordGroup,
  generateReviewVideo,
  getWordGroup,
  listWordGroups,
  updateWord,
} from "../api";

const { Title } = Typography;
const { RangePicker } = DatePicker;

function downloadCsv(detail: WordGroupOut) {
  const headers = ["英文", "中文", "KK 音標", "故事", "例句"];
  const rows = detail.words.map((w) => [
    w.english,
    w.chinese ?? "",
    w.kk_phonetic ?? "",
    w.mnemonic ?? "",
    w.example_sentence ?? "",
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${detail.title}_${detail.saved_date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadPdf(id: string) {
  const res = await api.get(`/word-groups/${id}/pdf`, { responseType: "blob" });
  const contentDisposition = res.headers["content-disposition"] || "";
  const filenameMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/);
  const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : "download.pdf";

  const blob = new Blob([res.data], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function HistoryPage() {
  const [groups, setGroups] = useState<WordGroupSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTitle, setSearchTitle] = useState("");
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);

  // Detail modal
  const [detail, setDetail] = useState<WordGroupOut | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Editable state
  const [editWords, setEditWords] = useState<WordOut[]>([]);
  const [saving, setSaving] = useState(false);

  // Review video selection — backed by DB marked_for_review
  const selectedWordIds = new Set(editWords.filter((w) => w.marked_for_review).map((w) => w.id));
  const [videoLoading, setVideoLoading] = useState(false);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (searchTitle) params.title = searchTitle;
      if (dateRange) {
        params.date_from = dateRange[0];
        params.date_to = dateRange[1];
      }
      const data = await listWordGroups(params);
      setGroups(data);
    } catch {
      message.error("載入失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const openDetail = async (id: string) => {
    try {
      const data = await getWordGroup(id);
      setDetail(data);
      setEditWords(data.words.map((w) => ({ ...w })));
      setDetailOpen(true);
    } catch {
      message.error("載入詳情失敗");
    }
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: "確認刪除？",
      content: "刪除後無法復原",
      okText: "刪除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        await deleteWordGroup(id);
        message.success("已刪除");
        fetchGroups();
      },
    });
  };

  const handleDownload = async (id: string, format: "csv" | "pdf") => {
    try {
      if (format === "csv") {
        const data = await getWordGroup(id);
        downloadCsv(data);
      } else {
        await downloadPdf(id);
      }
    } catch {
      message.error("下載失敗");
    }
  };

  const updateEditWord = (index: number, field: keyof WordOut, value: string) => {
    setEditWords((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSave = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const promises = editWords.map((w, i) => {
        const original = detail.words[i];
        const changes: Record<string, string> = {};
        for (const field of ["english", "chinese", "kk_phonetic", "mnemonic", "example_sentence"] as const) {
          if ((w[field] ?? "") !== (original[field] ?? "")) {
            changes[field] = w[field] ?? "";
          }
        }
        if (Object.keys(changes).length > 0) {
          return updateWord(w.id, changes);
        }
        return null;
      });
      await Promise.all(promises.filter(Boolean));
      message.success("儲存成功！");
      const refreshed = await getWordGroup(detail.id);
      setDetail(refreshed);
      setEditWords(refreshed.words.map((w) => ({ ...w })));
    } catch {
      message.error("儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const toggleWordSelection = async (id: string) => {
    const word = editWords.find((w) => w.id === id);
    if (!word) return;
    const newVal = !word.marked_for_review;
    setEditWords((prev) => prev.map((w) => (w.id === id ? { ...w, marked_for_review: newVal } : w)));
    try {
      await batchMarkWords([id], newVal);
    } catch {
      // revert on failure
      setEditWords((prev) => prev.map((w) => (w.id === id ? { ...w, marked_for_review: !newVal } : w)));
      message.error("標記失敗");
    }
  };

  const toggleAllWords = async () => {
    const allSelected = editWords.length > 0 && selectedWordIds.size === editWords.length;
    const newVal = !allSelected;
    const ids = editWords.map((w) => w.id);
    setEditWords((prev) => prev.map((w) => ({ ...w, marked_for_review: newVal })));
    try {
      await batchMarkWords(ids, newVal);
    } catch {
      setEditWords((prev) => prev.map((w) => ({ ...w, marked_for_review: !newVal })));
      message.error("標記失敗");
    }
  };

  const handleGenerateReviewVideo = async () => {
    const selected = editWords.filter((w) => selectedWordIds.has(w.id));
    if (!selected.length) {
      message.warning("請勾選至少一個單字");
      return;
    }
    setVideoLoading(true);
    try {
      const blob = await generateReviewVideo(
        selected.map((w) => ({
          english: w.english,
          chinese: w.chinese,
          kk_phonetic: w.kk_phonetic,
          mnemonic: w.mnemonic,
        }))
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `複習_${detail?.title ?? "review"}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
      message.success("複習 MP4 下載完成！");
    } catch (e: any) {
      message.error("MP4 生成失敗：" + (e?.response?.data?.detail || e.message));
    } finally {
      setVideoLoading(false);
    }
  };

  const groupColumns = [
    { title: "標題", dataIndex: "title", key: "title" },
    { title: "日期", dataIndex: "saved_date", key: "saved_date", width: 130 },
    { title: "單字數", dataIndex: "word_count", key: "word_count", width: 80, align: "center" as const },
    {
      title: "操作",
      width: 200,
      render: (_: unknown, record: WordGroupSummary) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openDetail(record.id)}>
            編輯
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: "csv", label: "CSV" },
                { key: "pdf", label: "PDF" },
              ],
              onClick: ({ key }) => handleDownload(record.id, key as "csv" | "pdf"),
            }}
          >
            <Button size="small" icon={<DownloadOutlined />}>
              下載
            </Button>
          </Dropdown>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
        </Space>
      ),
    },
  ];

  const wordColumns = [
    {
      title: (
        <Checkbox
          checked={editWords.length > 0 && selectedWordIds.size === editWords.length}
          indeterminate={selectedWordIds.size > 0 && selectedWordIds.size < editWords.length}
          onChange={toggleAllWords}
        />
      ),
      width: 50,
      render: (_: unknown, record: WordOut) => (
        <Checkbox
          checked={selectedWordIds.has(record.id)}
          onChange={() => toggleWordSelection(record.id)}
        />
      ),
    },
    {
      title: "英文",
      dataIndex: "english",
      width: 120,
      render: (text: string, _: WordOut, index: number) => (
        <Input
          value={editWords[index]?.english ?? text}
          onChange={(e) => updateEditWord(index, "english", e.target.value)}
        />
      ),
    },
    {
      title: "中文",
      dataIndex: "chinese",
      width: 120,
      render: (text: string | null, _: WordOut, index: number) => (
        <Input
          value={editWords[index]?.chinese ?? text ?? ""}
          onChange={(e) => updateEditWord(index, "chinese", e.target.value)}
        />
      ),
    },
    {
      title: "KK 音標",
      dataIndex: "kk_phonetic",
      width: 150,
      render: (text: string | null, _: WordOut, index: number) => (
        <Input
          value={editWords[index]?.kk_phonetic ?? text ?? ""}
          onChange={(e) => updateEditWord(index, "kk_phonetic", e.target.value)}
        />
      ),
    },
    {
      title: "故事",
      dataIndex: "mnemonic",
      width: 150,
      render: (text: string | null, _: WordOut, index: number) => (
        <Input
          value={editWords[index]?.mnemonic ?? text ?? ""}
          onChange={(e) => updateEditWord(index, "mnemonic", e.target.value)}
        />
      ),
    },
    {
      title: "例句",
      dataIndex: "example_sentence",
      render: (text: string | null, _: WordOut, index: number) => (
        <Input.TextArea
          value={editWords[index]?.example_sentence ?? text ?? ""}
          onChange={(e) => updateEditWord(index, "example_sentence", e.target.value)}
          autoSize={{ minRows: 1, maxRows: 3 }}
        />
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <Title level={2}>歷史紀錄</Title>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜尋標題"
            value={searchTitle}
            onChange={(e) => setSearchTitle(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <RangePicker
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setDateRange([dates[0].format("YYYY-MM-DD"), dates[1].format("YYYY-MM-DD")]);
              } else {
                setDateRange(null);
              }
            }}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={fetchGroups}>
            搜尋
          </Button>
        </Space>
      </Card>

      <Table
        dataSource={groups}
        columns={groupColumns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={detail ? `${detail.title} (${detail.saved_date})` : ""}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        width={1100}
        footer={
          <Space>
            <Button onClick={() => setDetailOpen(false)}>關閉</Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saving}
            >
              儲存修改
            </Button>
            <Button
              icon={<PlaySquareOutlined />}
              onClick={handleGenerateReviewVideo}
              loading={videoLoading}
              disabled={selectedWordIds.size === 0}
            >
              生成複習 MP4 ({selectedWordIds.size})
            </Button>
          </Space>
        }
      >
        {detail && (
          <Table
            dataSource={editWords}
            columns={wordColumns}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ x: 800 }}
          />
        )}
      </Modal>
    </div>
  );
}

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  DatePicker,
  Input,
  message,
  Modal,
  Space,
  Table,
  Typography,
} from "antd";
import { DeleteOutlined, EditOutlined, SaveOutlined, SearchOutlined } from "@ant-design/icons";
import type { WordGroupSummary, WordGroupOut, WordOut } from "../api";
import { deleteWordGroup, getWordGroup, listWordGroups, updateWord } from "../api";

const { Title } = Typography;
const { RangePicker } = DatePicker;

export default function HistoryPage() {
  const [groups, setGroups] = useState<WordGroupSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTitle, setSearchTitle] = useState("");
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);

  // Detail modal
  const [detail, setDetail] = useState<WordGroupOut | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Editable state: local copy of words for editing
  const [editWords, setEditWords] = useState<WordOut[]>([]);
  const [saving, setSaving] = useState(false);

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
      // Refresh detail
      const refreshed = await getWordGroup(detail.id);
      setDetail(refreshed);
      setEditWords(refreshed.words.map((w) => ({ ...w })));
    } catch {
      message.error("儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const groupColumns = [
    { title: "標題", dataIndex: "title", key: "title" },
    { title: "日期", dataIndex: "saved_date", key: "saved_date", width: 130 },
    { title: "單字數", dataIndex: "word_count", key: "word_count", width: 80, align: "center" as const },
    {
      title: "操作",
      width: 120,
      render: (_: unknown, record: WordGroupSummary) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openDetail(record.id)}>
            編輯
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
        </Space>
      ),
    },
  ];

  const wordColumns = [
    {
      title: "英文",
      dataIndex: "english",
      width: 130,
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
      width: 130,
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
      width: 160,
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
      width: 160,
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

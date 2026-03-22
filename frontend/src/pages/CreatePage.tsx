import { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Input,
  message,
  Space,
  Spin,
  Table,
  Typography,
  Upload,
} from "antd";
import { DeleteOutlined, PlusOutlined, SendOutlined, SaveOutlined, UploadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { WordGenerateRequest, WordResult } from "../api";
import { generateWords, saveWordGroup, uploadCsv } from "../api";

const { Title } = Typography;

interface WordInput {
  key: string;
  english: string;
  need_chinese: boolean;
  need_kk: boolean;
  need_example: boolean;
  need_mnemonic: boolean;
}

let keyCounter = 0;
const newRow = (): WordInput => ({
  key: String(++keyCounter),
  english: "",
  need_chinese: true,
  need_kk: true,
  need_example: true,
  need_mnemonic: true,
});

export default function CreatePage() {
  const [inputs, setInputs] = useState<WordInput[]>([newRow()]);
  const [results, setResults] = useState<WordResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [savedDate, setSavedDate] = useState(dayjs().format("YYYY-MM-DD"));

  // --- Input phase ---

  const updateInput = (key: string, field: keyof WordInput, value: unknown) => {
    setInputs((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r))
    );
  };

  const addRow = () => setInputs((prev) => [...prev, newRow()]);

  const removeRow = (key: string) => {
    setInputs((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length ? next : [newRow()];
    });
  };

  const handleGenerate = async () => {
    const valid = inputs.filter((r) => r.english.trim());
    if (!valid.length) {
      message.warning("請至少輸入一個英文單字");
      return;
    }

    setLoading(true);
    try {
      const req: WordGenerateRequest[] = valid.map((r) => ({
        english: r.english.trim(),
        need_chinese: r.need_chinese,
        need_kk: r.need_kk,
        need_example: r.need_example,
        need_mnemonic: r.need_mnemonic,
      }));
      const data = await generateWords(req);
      setResults(data.map((d, i) => ({ ...d, key: String(i) })));
      message.success("生成完成！");
    } catch (e: any) {
      message.error("生成失敗：" + (e?.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  // --- CSV upload ---

  const handleCsvUpload = async (file: File) => {
    try {
      const data = await uploadCsv(file);
      const detectedFields = Object.keys(data.detected_columns);
      setResults(
        data.words.map((w, i) => ({
          ...w,
          key: String(i),
        }))
      );
      message.success(
        `已匯入 ${data.words.length} 個單字（偵測到欄位：${detectedFields.join("、")}）`
      );
    } catch (e: any) {
      message.error("CSV 匯入失敗：" + (e?.response?.data?.detail || e.message));
    }
    return false; // prevent antd default upload
  };

  // --- Result phase ---

  const updateResult = (index: number, field: keyof WordResult, value: string) => {
    setResults((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSave = async () => {
    if (!groupTitle.trim()) {
      message.warning("請輸入標題");
      return;
    }
    if (!results?.length) return;

    setSaving(true);
    try {
      await saveWordGroup({
        title: groupTitle.trim(),
        saved_date: savedDate,
        words: results.map((r, i) => ({
          english: r.english,
          chinese: r.chinese,
          kk_phonetic: r.kk_phonetic,
          mnemonic: r.mnemonic,
          example_sentence: r.example_sentence,
          sort_order: i,
        })),
      });
      message.success("儲存成功！");
      // Reset
      setResults(null);
      setInputs([newRow()]);
      setGroupTitle("");
      setSavedDate(dayjs().format("YYYY-MM-DD"));
    } catch (e: any) {
      message.error("儲存失敗：" + (e?.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  };

  // --- Input columns ---

  const inputColumns = [
    {
      title: "英文單字",
      dataIndex: "english",
      width: 200,
      render: (_: unknown, record: WordInput) => (
        <Input
          value={record.english}
          onChange={(e) => updateInput(record.key, "english", e.target.value)}
          placeholder="e.g. ambulance"
          onPressEnter={addRow}
        />
      ),
    },
    {
      title: "中文",
      dataIndex: "need_chinese",
      width: 70,
      align: "center" as const,
      render: (_: unknown, record: WordInput) => (
        <Checkbox
          checked={record.need_chinese}
          onChange={(e) => updateInput(record.key, "need_chinese", e.target.checked)}
        />
      ),
    },
    {
      title: "KK音標",
      dataIndex: "need_kk",
      width: 80,
      align: "center" as const,
      render: (_: unknown, record: WordInput) => (
        <Checkbox
          checked={record.need_kk}
          onChange={(e) => updateInput(record.key, "need_kk", e.target.checked)}
        />
      ),
    },
    {
      title: "例句",
      dataIndex: "need_example",
      width: 70,
      align: "center" as const,
      render: (_: unknown, record: WordInput) => (
        <Checkbox
          checked={record.need_example}
          onChange={(e) => updateInput(record.key, "need_example", e.target.checked)}
        />
      ),
    },
    {
      title: "諧音",
      dataIndex: "need_mnemonic",
      width: 70,
      align: "center" as const,
      render: (_: unknown, record: WordInput) => (
        <Checkbox
          checked={record.need_mnemonic}
          onChange={(e) => updateInput(record.key, "need_mnemonic", e.target.checked)}
        />
      ),
    },
    {
      title: "",
      width: 50,
      render: (_: unknown, record: WordInput) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeRow(record.key)}
        />
      ),
    },
  ];

  // --- Result columns (editable) ---

  const resultColumns = [
    {
      title: "英文",
      dataIndex: "english",
      width: 150,
      render: (text: string, _: WordResult, index: number) => (
        <Input value={text} onChange={(e) => updateResult(index, "english", e.target.value)} />
      ),
    },
    {
      title: "中文",
      dataIndex: "chinese",
      width: 150,
      render: (text: string | null, _: WordResult, index: number) => (
        <Input value={text ?? ""} onChange={(e) => updateResult(index, "chinese", e.target.value)} />
      ),
    },
    {
      title: "KK 音標",
      dataIndex: "kk_phonetic",
      width: 180,
      render: (text: string | null, _: WordResult, index: number) => (
        <Input value={text ?? ""} onChange={(e) => updateResult(index, "kk_phonetic", e.target.value)} />
      ),
    },
    {
      title: "諧音記憶",
      dataIndex: "mnemonic",
      width: 180,
      render: (text: string | null, _: WordResult, index: number) => (
        <Input value={text ?? ""} onChange={(e) => updateResult(index, "mnemonic", e.target.value)} />
      ),
    },
    {
      title: "例句",
      dataIndex: "example_sentence",
      width: 300,
      render: (text: string | null, _: WordResult, index: number) => (
        <Input.TextArea
          value={text ?? ""}
          onChange={(e) => updateResult(index, "example_sentence", e.target.value)}
          autoSize={{ minRows: 1, maxRows: 3 }}
        />
      ),
    },
  ];

  // --- Render ---

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <Title level={2}>新增單字</Title>

      {/* Input phase */}
      {!results && (
        <Card>
          <Table
            dataSource={inputs}
            columns={inputColumns}
            pagination={false}
            rowKey="key"
            size="middle"
          />
          <Space style={{ marginTop: 16 }}>
            <Button icon={<PlusOutlined />} onClick={addRow}>
              新增一列
            </Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleGenerate}
              loading={loading}
            >
              送出生成
            </Button>
            <Upload
              accept=".csv"
              showUploadList={false}
              beforeUpload={(file) => {
                handleCsvUpload(file as File);
                return false;
              }}
            >
              <Button icon={<UploadOutlined />}>匯入 CSV</Button>
            </Upload>
          </Space>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin size="large" tip="LLM 生成中..." />
        </div>
      )}

      {/* Result phase */}
      {results && !loading && (
        <Card>
          <Space style={{ marginBottom: 16, width: "100%" }} direction="vertical">
            <Space>
              <Input
                placeholder="標題（例如：TOEIC 第一課）"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                style={{ width: 300 }}
              />
              <DatePicker
                value={dayjs(savedDate)}
                onChange={(d) => setSavedDate(d ? d.format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD"))}
              />
            </Space>
          </Space>

          <Table
            dataSource={results}
            columns={resultColumns}
            pagination={false}
            rowKey="key"
            size="middle"
            scroll={{ x: 960 }}
          />

          <Space style={{ marginTop: 16 }}>
            <Button onClick={() => setResults(null)}>返回修改輸入</Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saving}
            >
              儲存到資料庫
            </Button>
          </Space>
        </Card>
      )}
    </div>
  );
}

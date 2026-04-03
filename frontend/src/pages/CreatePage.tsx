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
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import {
  ClearOutlined,
  DeleteOutlined,
  FileOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  SendOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { WordGenerateRequest, WordResult } from "../api";
import { generateWords, saveWordGroup, uploadCsv } from "../api";

const { Title } = Typography;

interface WordRow {
  key: string;
  english: string;
  chinese: string | null;
  kk_phonetic: string | null;
  mnemonic: string | null;
  mnemonic_options: string[] | null;
  example_sentence: string | null;
  need_chinese: boolean;
  need_kk: boolean;
  need_example: boolean;
  need_mnemonic: boolean;
  generated: boolean; // whether LLM has been called for this row
}

let keyCounter = 0;
const newRow = (): WordRow => ({
  key: String(++keyCounter),
  english: "",
  chinese: null,
  kk_phonetic: null,
  mnemonic: null,
  mnemonic_options: null,
  example_sentence: null,
  need_chinese: true,
  need_kk: true,
  need_example: true,
  need_mnemonic: true,
  generated: false,
});

const DRAFTS_KEY = "createPage_drafts";
const ACTIVE_KEY = "createPage_activeDraft";

interface DraftData {
  rows: WordRow[];
  groupTitle: string;
  savedDate: string;
}

function loadAllDrafts(): Record<string, DraftData> {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveAllDrafts(drafts: Record<string, DraftData>) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

function getActiveDraftName(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

function setActiveDraftName(name: string | null) {
  if (name) {
    localStorage.setItem(ACTIVE_KEY, name);
  } else {
    localStorage.removeItem(ACTIVE_KEY);
  }
}

export default function CreatePage() {
  const allDrafts = loadAllDrafts();
  const activeName = getActiveDraftName();
  const activeDraft = activeName ? allDrafts[activeName] : null;

  const [rows, setRows] = useState<WordRow[]>(activeDraft?.rows ?? [newRow()]);
  const [groupTitle, setGroupTitle] = useState(activeDraft?.groupTitle ?? "");
  const [savedDate, setSavedDate] = useState(activeDraft?.savedDate ?? dayjs().format("YYYY-MM-DD"));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null);
  const [currentDraftName, setCurrentDraftName] = useState<string | null>(activeName);
  const [draftNames, setDraftNames] = useState<string[]>(Object.keys(allDrafts));

  // Auto-save to current draft
  useEffect(() => {
    if (currentDraftName) {
      const drafts = loadAllDrafts();
      drafts[currentDraftName] = { rows, groupTitle, savedDate };
      saveAllDrafts(drafts);
      setActiveDraftName(currentDraftName);
    }
  }, [rows, groupTitle, savedDate, currentDraftName]);

  const handleSaveDraft = () => {
    const name = currentDraftName || groupTitle.trim() || `暫存 ${dayjs().format("MM/DD HH:mm")}`;
    const drafts = loadAllDrafts();
    drafts[name] = { rows, groupTitle, savedDate };
    saveAllDrafts(drafts);
    setCurrentDraftName(name);
    setActiveDraftName(name);
    setDraftNames(Object.keys(drafts));
    message.success(`已暫存「${name}」`);
  };

  const handleLoadDraft = (name: string) => {
    const drafts = loadAllDrafts();
    const d = drafts[name];
    if (d) {
      setRows(d.rows);
      setGroupTitle(d.groupTitle);
      setSavedDate(d.savedDate);
      setCurrentDraftName(name);
      setActiveDraftName(name);
    }
  };

  const handleDeleteDraft = (name: string) => {
    const drafts = loadAllDrafts();
    delete drafts[name];
    saveAllDrafts(drafts);
    setDraftNames(Object.keys(drafts));
    if (currentDraftName === name) {
      setCurrentDraftName(null);
      setActiveDraftName(null);
    }
    message.success(`已刪除暫存「${name}」`);
  };

  const handleNewDraft = () => {
    setRows([newRow()]);
    setGroupTitle("");
    setSavedDate(dayjs().format("YYYY-MM-DD"));
    setCurrentDraftName(null);
    setActiveDraftName(null);
  };

  const updateRow = (key: string, field: string, value: unknown) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, newRow()]);

  const removeRow = (key: string) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length ? next : [newRow()];
    });
  };

  const handleClearAll = () => {
    Modal.confirm({
      title: "確認清除？",
      content: "將清除當前輸入和生成的內容（已暫存的不受影響）",
      okText: "清除",
      okType: "danger",
      cancelText: "取消",
      onOk: () => {
        if (currentDraftName) {
          const drafts = loadAllDrafts();
          delete drafts[currentDraftName];
          saveAllDrafts(drafts);
          setDraftNames(Object.keys(drafts));
        }
        setRows([newRow()]);
        setGroupTitle("");
        setSavedDate(dayjs().format("YYYY-MM-DD"));
        setCurrentDraftName(null);
        setActiveDraftName(null);
      },
    });
  };

  // --- Generate all ---
  const handleGenerate = async () => {
    const valid = rows.filter((r) => r.english.trim());
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

      setRows((prev) => {
        const validKeys = valid.map((v) => v.key);
        let dataIdx = 0;
        return prev.map((r) => {
          if (validKeys.includes(r.key) && dataIdx < data.length) {
            const d = data[dataIdx++];
            return {
              ...r,
              chinese: d.chinese ?? r.chinese,
              kk_phonetic: d.kk_phonetic ?? r.kk_phonetic,
              example_sentence: d.example_sentence ?? r.example_sentence,
              mnemonic_options: d.mnemonic_options,
              mnemonic: d.mnemonic_options?.length === 1 ? d.mnemonic_options[0] : (r.mnemonic ?? null),
              generated: true,
            };
          }
          return r;
        });
      });
      message.success("生成完成！");
    } catch (e: any) {
      message.error("生成失敗：" + (e?.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  // --- Regenerate story for single word ---
  const handleRegenerateStory = async (key: string) => {
    const row = rows.find((r) => r.key === key);
    if (!row || !row.english.trim()) return;

    setRegeneratingKey(key);
    try {
      const data = await generateWords([{
        english: row.english.trim(),
        need_chinese: false,
        need_kk: false,
        need_example: false,
        need_mnemonic: true,
      }]);
      if (data.length > 0 && data[0].mnemonic_options) {
        updateRow(key, "mnemonic_options", data[0].mnemonic_options);
        updateRow(key, "mnemonic", null);
      }
    } catch {
      message.error("重新生成故事失敗");
    } finally {
      setRegeneratingKey(null);
    }
  };

  // --- CSV upload ---
  const handleCsvUpload = async (file: File) => {
    setLoading(true);
    try {
      const data = await uploadCsv(file);
      const detectedFields = Object.keys(data.detected_columns);
      const imported: WordRow[] = data.words.map((w, i) => ({
        key: String(++keyCounter),
        english: w.english,
        chinese: w.chinese,
        kk_phonetic: w.kk_phonetic,
        mnemonic: w.mnemonic_options?.length === 1 ? w.mnemonic_options[0] : (w.mnemonic ?? null),
        mnemonic_options: w.mnemonic_options ?? null,
        example_sentence: w.example_sentence,
        need_chinese: !w.chinese,
        need_kk: !w.kk_phonetic,
        need_example: !w.example_sentence,
        need_mnemonic: !w.mnemonic && !(w.mnemonic_options?.length),
        generated: true,
      }));
      setRows(imported);
      message.success(`已匯入 ${data.words.length} 個單字（偵測到欄位：${detectedFields.join("、")}）`);
    } catch (e: any) {
      message.error("CSV 匯入失敗：" + (e?.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
    return false;
  };

  // --- Save ---
  const handleSave = async () => {
    if (!groupTitle.trim()) {
      message.warning("請輸入標題");
      return;
    }
    const valid = rows.filter((r) => r.english.trim());
    if (!valid.length) {
      message.warning("沒有可儲存的單字");
      return;
    }

    setSaving(true);
    try {
      await saveWordGroup({
        title: groupTitle.trim(),
        saved_date: savedDate,
        words: valid.map((r, i) => ({
          english: r.english,
          chinese: r.chinese,
          kk_phonetic: r.kk_phonetic,
          mnemonic: r.mnemonic,
          example_sentence: r.example_sentence,
          sort_order: i,
        })),
      });
      message.success("儲存成功！");
      if (currentDraftName) {
        const drafts = loadAllDrafts();
        delete drafts[currentDraftName];
        saveAllDrafts(drafts);
        setDraftNames(Object.keys(drafts));
      }
      setRows([newRow()]);
      setGroupTitle("");
      setSavedDate(dayjs().format("YYYY-MM-DD"));
      setCurrentDraftName(null);
      setActiveDraftName(null);
    } catch (e: any) {
      message.error("儲存失敗：" + (e?.response?.data?.detail || e.message));
    } finally {
      setSaving(false);
    }
  };

  // --- Columns ---
  const columns = [
    {
      title: "英文",
      dataIndex: "english",
      width: 140,
      render: (text: string, record: WordRow) => (
        <Input
          value={text}
          onChange={(e) => updateRow(record.key, "english", e.target.value)}
          placeholder="e.g. ambulance"
          onPressEnter={addRow}
        />
      ),
    },
    {
      title: "中文",
      dataIndex: "chinese",
      width: 110,
      render: (text: string | null, record: WordRow) =>
        record.generated ? (
          <Input value={text ?? ""} onChange={(e) => updateRow(record.key, "chinese", e.target.value)} />
        ) : (
          <Checkbox checked={record.need_chinese} onChange={(e) => updateRow(record.key, "need_chinese", e.target.checked)} />
        ),
    },
    {
      title: "KK 音標",
      dataIndex: "kk_phonetic",
      width: 140,
      render: (text: string | null, record: WordRow) =>
        record.generated ? (
          <Input value={text ?? ""} onChange={(e) => updateRow(record.key, "kk_phonetic", e.target.value)} />
        ) : (
          <Checkbox checked={record.need_kk} onChange={(e) => updateRow(record.key, "need_kk", e.target.checked)} />
        ),
    },
    {
      title: "故事",
      dataIndex: "mnemonic",
      width: 260,
      render: (_: unknown, record: WordRow) => {
        if (!record.generated) {
          return <Checkbox checked={record.need_mnemonic} onChange={(e) => updateRow(record.key, "need_mnemonic", e.target.checked)} />;
        }
        const options = record.mnemonic_options;
        return (
          <Space direction="vertical" size={4} style={{ width: "100%" }}>
            {options && options.length > 1 && (
              <Checkbox.Group
                value={(record.mnemonic ?? "").split("\n").filter((s) => options.includes(s))}
                onChange={(checked) => {
                  const custom = (record.mnemonic ?? "").split("\n").find((s) => !options.includes(s)) ?? "";
                  const parts = [...(checked as string[])];
                  if (custom) parts.push(custom);
                  updateRow(record.key, "mnemonic", parts.join("\n"));
                }}
              >
                <Space direction="vertical" size={4}>
                  {options.map((opt, i) => (
                    <Checkbox key={i} value={opt} style={{ fontSize: 13 }}>{opt}</Checkbox>
                  ))}
                </Space>
              </Checkbox.Group>
            )}
            <Input
              placeholder="自行輸入..."
              value={
                options && options.length > 1
                  ? (record.mnemonic ?? "").split("\n").find((s) => !options.includes(s)) ?? ""
                  : (record.mnemonic ?? "")
              }
              onChange={(e) => {
                if (options && options.length > 1) {
                  const checked = (record.mnemonic ?? "").split("\n").filter((s) => options.includes(s));
                  const parts = [...checked];
                  if (e.target.value) parts.push(e.target.value);
                  updateRow(record.key, "mnemonic", parts.join("\n"));
                } else {
                  updateRow(record.key, "mnemonic", e.target.value);
                }
              }}
              size="small"
            />
            <Tooltip title="重新生成故事">
              <Button
                size="small"
                icon={<ReloadOutlined />}
                loading={regeneratingKey === record.key}
                onClick={() => handleRegenerateStory(record.key)}
              />
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: "例句",
      dataIndex: "example_sentence",
      width: 220,
      render: (text: string | null, record: WordRow) =>
        record.generated ? (
          <Input.TextArea
            value={text ?? ""}
            onChange={(e) => updateRow(record.key, "example_sentence", e.target.value)}
            autoSize={{ minRows: 1, maxRows: 3 }}
          />
        ) : (
          <Checkbox checked={record.need_example} onChange={(e) => updateRow(record.key, "need_example", e.target.checked)} />
        ),
    },
    {
      title: "",
      width: 40,
      render: (_: unknown, record: WordRow) => (
        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeRow(record.key)} />
      ),
    },
  ];

  // --- Render ---
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <Space style={{ marginBottom: 16, width: "100%", justifyContent: "space-between" }}>
        <Space>
          <Title level={2} style={{ margin: 0 }}>新增單字</Title>
          {currentDraftName && <Tag color="blue">{currentDraftName}</Tag>}
        </Space>
        <Space>
          <Button icon={<FileOutlined />} onClick={handleNewDraft}>新建</Button>
          <Button icon={<SaveOutlined />} onClick={handleSaveDraft}>暫存</Button>
          {draftNames.length > 0 && (
            <Dropdown
              menu={{
                items: draftNames.map((name) => ({
                  key: name,
                  label: (
                    <Space style={{ width: "100%", justifyContent: "space-between" }}>
                      <span onClick={() => handleLoadDraft(name)}>{name}</span>
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => { e.stopPropagation(); handleDeleteDraft(name); }}
                      />
                    </Space>
                  ),
                })),
              }}
            >
              <Button icon={<FolderOpenOutlined />}>載入暫存 ({draftNames.length})</Button>
            </Dropdown>
          )}
        </Space>
      </Space>

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
          dataSource={rows}
          columns={columns}
          pagination={false}
          rowKey="key"
          size="middle"
          scroll={{ x: 910 }}
        />

        <Space style={{ marginTop: 16 }} wrap>
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
            beforeUpload={(file) => { handleCsvUpload(file as File); return false; }}
          >
            <Button icon={<UploadOutlined />}>匯入 CSV</Button>
          </Upload>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
          >
            儲存到資料庫
          </Button>
          <Button danger icon={<ClearOutlined />} onClick={handleClearAll}>
            清除全部
          </Button>
        </Space>
      </Card>

      {loading && (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin size="large" tip="生成中..." />
        </div>
      )}
    </div>
  );
}

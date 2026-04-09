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
  term: string;
  definition: string | null;
  reading: string | null;
  mnemonic: string | null;
  mnemonic_options: string[] | null;
  example_sentence: string | null;
  need_definition: boolean;
  need_reading: boolean;
  need_example: boolean;
  need_mnemonic: boolean;
  generated: boolean; // whether LLM has been called for this row
}

let keyCounter = 0;
const newRow = (): WordRow => ({
  key: String(++keyCounter),
  term: "",
  definition: null,
  reading: null,
  mnemonic: null,
  mnemonic_options: null,
  example_sentence: null,
  need_definition: true,
  need_reading: true,
  need_example: true,
  need_mnemonic: true,
  generated: false,
});

import {
  loadAllDrafts,
  saveAllDrafts,
  getActiveDraftName,
  setActiveDraftName,
} from "../utils/drafts";

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
    const prefix = groupTitle.trim() || "暫存";
    const timestamp = dayjs().format("MM/DD HH:mm");
    const name = `${prefix} ${timestamp}`;
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
    const valid = rows.filter((r) => r.term.trim());
    if (!valid.length) {
      message.warning("請至少輸入一個日文單字");
      return;
    }

    setLoading(true);
    try {
      const req: WordGenerateRequest[] = valid.map((r) => ({
        term: r.term.trim(),
        need_definition: r.need_definition,
        need_reading: r.need_reading,
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
              definition: d.definition ?? r.definition,
              reading: d.reading ?? r.reading,
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

  // --- Regenerate mnemonic for single word ---
  const handleRegenerateMnemonic = async (key: string) => {
    const row = rows.find((r) => r.key === key);
    if (!row || !row.term.trim()) return;

    setRegeneratingKey(key);
    try {
      const data = await generateWords([{
        term: row.term.trim(),
        need_definition: false,
        need_reading: false,
        need_example: false,
        need_mnemonic: true,
      }], true);
      if (data.length > 0 && data[0].mnemonic_options) {
        updateRow(key, "mnemonic_options", data[0].mnemonic_options);
        updateRow(key, "mnemonic", null);
      }
    } catch {
      message.error("重新生成記憶法失敗");
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
      const imported: WordRow[] = data.words.map((w) => ({
        key: String(++keyCounter),
        term: w.term,
        definition: w.definition,
        reading: w.reading,
        mnemonic: w.mnemonic_options?.length === 1 ? w.mnemonic_options[0] : (w.mnemonic ?? null),
        mnemonic_options: w.mnemonic_options ?? null,
        example_sentence: w.example_sentence,
        need_definition: !w.definition,
        need_reading: !w.reading,
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
    const valid = rows.filter((r) => r.term.trim());
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
          term: r.term,
          definition: r.definition,
          reading: r.reading,
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
      title: "日文",
      dataIndex: "term",
      width: 140,
      render: (text: string, record: WordRow) => (
        <Input
          value={text}
          onChange={(e) => updateRow(record.key, "term", e.target.value)}
          placeholder="例：食べる"
          onPressEnter={addRow}
        />
      ),
    },
    {
      title: "中文",
      dataIndex: "definition",
      width: 110,
      render: (text: string | null, record: WordRow) =>
        record.generated ? (
          <Input value={text ?? ""} onChange={(e) => updateRow(record.key, "definition", e.target.value)} />
        ) : (
          <Checkbox checked={record.need_definition} onChange={(e) => updateRow(record.key, "need_definition", e.target.checked)} />
        ),
    },
    {
      title: "讀音",
      dataIndex: "reading",
      width: 140,
      render: (text: string | null, record: WordRow) =>
        record.generated ? (
          <Input value={text ?? ""} onChange={(e) => updateRow(record.key, "reading", e.target.value)} />
        ) : (
          <Checkbox checked={record.need_reading} onChange={(e) => updateRow(record.key, "need_reading", e.target.checked)} />
        ),
    },
    {
      title: "記憶法",
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
            <Tooltip title="重新生成記憶法">
              <Button
                size="small"
                icon={<ReloadOutlined />}
                loading={regeneratingKey === record.key}
                onClick={() => handleRegenerateMnemonic(record.key)}
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
                      <span>{name}</span>
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
                onClick: ({ key }) => handleLoadDraft(key),
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
              placeholder="標題（例如：N3 第一課）"
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

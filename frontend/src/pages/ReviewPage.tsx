import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  InputNumber,
  Modal,
  Progress,
  Radio,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  QuestionCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  SoundOutlined,
} from "@ant-design/icons";
import { message } from "antd";
import dayjs from "dayjs";
import SpeakButton from "../components/SpeakButton";
import { downloadBlob, extractFilename } from "../utils/download";
import { TYPE_LABELS, PERIOD_LABELS } from "../utils/labels";
import type { ReviewWord, ReviewStats, ReviewWordStat, ExportWord, SeedStatus } from "../api";
import api, { getReviewWords, logReview, getReviewStats, exportTopWords, getSeedStatus, importJlptLevel } from "../api";

const { Title, Text } = Typography;

type ReviewResult = "remember" | "unsure" | "forget";

export default function ReviewPage() {
  // Settings
  const [source, setSource] = useState<"all" | "marked">("all");
  const [count, setCount] = useState(20);

  // Review state
  const [words, setWords] = useState<ReviewWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [phase, setPhase] = useState<"settings" | "review" | "done">("settings");
  const [loading, setLoading] = useState(false);

  // Results tracking
  const [results, setResults] = useState<Map<string, ReviewResult>>(new Map());

  // Stats modal
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState<ReviewStats | null>(null);

  // Export modal
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportData, setExportData] = useState<ExportWord[]>([]);
  const [exportType, setExportType] = useState<string>("forget");
  const [exportPeriod, setExportPeriod] = useState<string>("week");
  const [exportLimit, setExportLimit] = useState(10);
  const [exportFields, setExportFields] = useState<string[]>(["term", "definition", "reading", "mnemonic", "example_sentence"]);

  // JLPT seed import
  const [seedStatus, setSeedStatus] = useState<SeedStatus | null>(null);
  const [seedLoading, setSeedLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getSeedStatus().then(setSeedStatus).catch(() => {});
  }, []);

  const handleImportLevel = async (level: string) => {
    setSeedLoading((prev) => ({ ...prev, [level]: true }));
    try {
      const result = await importJlptLevel(level);
      message.success(`已匯入 ${result.imported_words} 個單字（${result.imported_groups} 組）`);
      const updated = await getSeedStatus();
      setSeedStatus(updated);
    } catch {
      message.error("匯入失敗");
    } finally {
      setSeedLoading((prev) => ({ ...prev, [level]: false }));
    }
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const data = await exportTopWords({ result_type: exportType, period: exportPeriod, limit: exportLimit });
      setExportData(data);
    } finally {
      setExportLoading(false);
    }
  };

  const handleDownloadExportCsv = async () => {
    try {
      const res = await api.get("/review/export/csv", {
        params: {
          result_type: exportType,
          period: exportPeriod,
          limit: exportLimit,
          fields: exportFields.join(","),
        },
        responseType: "blob",
      });
      const filename = extractFilename(res.headers, "export.csv");
      downloadBlob(new Blob([res.data]), filename);
    } catch {
      message.error("CSV 下載失敗");
    }
  };

  const handleDownloadExportPdf = async () => {
    try {
      const res = await api.get("/review/export/pdf", {
        params: {
          result_type: exportType,
          period: exportPeriod,
          limit: exportLimit,
          fields: exportFields.join(","),
        },
        responseType: "blob",
      });
      const filename = extractFilename(
        res.headers,
        `${dayjs().format("YYYY-MM-DD")}_export.pdf`
      );
      downloadBlob(new Blob([res.data]), filename);
    } catch {
      message.error("PDF 下載失敗");
    }
  };

  const handleOpenStats = async () => {
    setStatsOpen(true);
    setStatsLoading(true);
    try {
      const data = await getReviewStats();
      setStats(data);
    } finally {
      setStatsLoading(false);
    }
  };

  const currentWord = words[currentIndex] ?? null;
  const rememberCount = [...results.values()].filter((r) => r === "remember").length;
  const unsureCount = [...results.values()].filter((r) => r === "unsure").length;
  const forgetCount = [...results.values()].filter((r) => r === "forget").length;

  const handleStart = async () => {
    setLoading(true);
    try {
      const data = await getReviewWords(source, count);
      if (!data.length) {
        setWords([]);
        setPhase("done");
        return;
      }
      setWords(data);
      setCurrentIndex(0);
      setFlipped(false);
      setResults(new Map());
      setPhase("review");
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = useCallback(
    async (result: ReviewResult) => {
      if (!currentWord || !flipped) return;

      // Log to DB
      logReview(currentWord.id, result);

      // Track locally
      setResults((prev) => new Map(prev).set(currentWord.id, result));

      // Next word or done
      if (currentIndex + 1 < words.length) {
        setCurrentIndex((i) => i + 1);
        setFlipped(false);
      } else {
        setPhase("done");
      }
    },
    [currentWord, flipped, currentIndex, words.length]
  );

  const handleFlip = useCallback(() => {
    if (phase === "review" && !flipped) {
      setFlipped(true);
    }
  }, [phase, flipped]);

  // Keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase !== "review") return;

      if (e.code === "Space") {
        e.preventDefault();
        handleFlip();
      } else if (e.code === "ArrowLeft" && flipped) {
        e.preventDefault();
        handleAnswer("remember");
      } else if (e.code === "ArrowUp" && flipped) {
        e.preventDefault();
        handleAnswer("unsure");
      } else if (e.code === "ArrowRight" && flipped) {
        e.preventDefault();
        handleAnswer("forget");
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, flipped, handleFlip, handleAnswer]);

  // --- Settings Phase ---
  if (phase === "settings") {
    return (
      <div style={{ maxWidth: 600, margin: "0 auto", padding: 24 }}>
        <Title level={2}>複習</Title>
        <Card>
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <div>
              <Text strong>來源：</Text>
              <Radio.Group
                value={source}
                onChange={(e) => setSource(e.target.value)}
                style={{ marginLeft: 12 }}
              >
                <Radio value="all">全部單字</Radio>
                <Radio value="marked">已勾選的</Radio>
              </Radio.Group>
            </div>
            <div>
              <Text strong>數量：</Text>
              <Select
                value={count}
                onChange={setCount}
                style={{ width: 100, marginLeft: 12 }}
                options={[
                  { value: 10, label: "10" },
                  { value: 20, label: "20" },
                  { value: 30, label: "30" },
                  { value: 50, label: "50" },
                ]}
              />
            </div>
            <Button type="primary" size="large" onClick={handleStart} loading={loading} block>
              開始複習
            </Button>
            <Button size="large" onClick={handleOpenStats} block>
              查看複習統計
            </Button>
            <Button size="large" onClick={() => setExportOpen(true)} block>
              匯出單字
            </Button>
          </Space>
        </Card>

        {/* JLPT Import */}
        <Card style={{ marginTop: 16 }}>
          <Title level={4} style={{ marginTop: 0 }}>匯入 JLPT 單字庫</Title>
          <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
            一鍵匯入 JLPT N5~N1 單字，每 25 個字為一組，立即開始複習
          </Text>
          <Space direction="vertical" style={{ width: "100%" }}>
            {(["n5", "n4", "n3", "n2", "n1"] as const).map((level) => {
              const s = seedStatus?.[level];
              const fullyImported = s?.fully_imported ?? false;
              const imported = s?.imported_groups ?? 0;
              const total = s?.total_groups ?? 0;
              return (
                <div key={level} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Space>
                    <Tag color={fullyImported ? "green" : "blue"} style={{ fontSize: 14, padding: "2px 12px" }}>
                      {level.toUpperCase()}
                    </Tag>
                    <Text>
                      {s ? `${s.total_words} 字 / ${total} 組` : "載入中..."}
                      {imported > 0 && !fullyImported && ` (已匯入 ${imported}/${total} 組)`}
                      {fullyImported && " ✓ 已匯入"}
                    </Text>
                  </Space>
                  <Button
                    icon={<DownloadOutlined />}
                    onClick={() => handleImportLevel(level)}
                    loading={seedLoading[level]}
                    disabled={fullyImported}
                  >
                    {fullyImported ? "已匯入" : imported > 0 ? "繼續匯入" : "匯入"}
                  </Button>
                </div>
              );
            })}
          </Space>
        </Card>

        {/* Export modal */}
        <Modal
          title="匯出單字"
          open={exportOpen}
          onCancel={() => setExportOpen(false)}
          footer={null}
          width={750}
        >
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Space wrap>
              <span>類型：</span>
              <Select value={exportType} onChange={setExportType} style={{ width: 110 }} options={[
                { value: "forget", label: "忘記" },
                { value: "unsure", label: "不確定" },
                { value: "remember", label: "記得" },
              ]} />
              <span>時間：</span>
              <Select value={exportPeriod} onChange={setExportPeriod} style={{ width: 110 }} options={[
                { value: "today", label: "本日" },
                { value: "week", label: "本週" },
                { value: "month", label: "本月" },
                { value: "quarter", label: "本季" },
                { value: "all", label: "全部" },
              ]} />
              <span>Top：</span>
              <InputNumber
                min={1}
                max={500}
                value={exportLimit}
                onChange={(v) => setExportLimit(v ?? 10)}
                style={{ width: 80 }}
              />
            </Space>
            <div>
              <Text strong>包含欄位：</Text>
              <Checkbox.Group
                value={exportFields}
                onChange={(v) => setExportFields(v as string[])}
                style={{ marginLeft: 8 }}
                options={[
                  { label: "日文", value: "term" },
                  { label: "中文", value: "definition" },
                  { label: "讀音", value: "reading" },
                  { label: "記憶法", value: "mnemonic" },
                  { label: "例句", value: "example_sentence" },
                ]}
              />
            </div>
            <Button type="primary" onClick={handleExport} loading={exportLoading}>
              查詢
            </Button>
            {exportData.length > 0 && (
              <>
                <Table
                  dataSource={exportData}
                  columns={[
                    ...(exportFields.includes("term") ? [{ title: "日文", dataIndex: "term", key: "term", width: 120 }] : []),
                    ...(exportFields.includes("definition") ? [{ title: "中文", dataIndex: "definition", key: "definition", width: 100 }] : []),
                    ...(exportFields.includes("reading") ? [{ title: "讀音", dataIndex: "reading", key: "reading", width: 130 }] : []),
                    ...(exportFields.includes("mnemonic") ? [{ title: "記憶法", dataIndex: "mnemonic", key: "mnemonic", width: 120 }] : []),
                    ...(exportFields.includes("example_sentence") ? [{ title: "例句", dataIndex: "example_sentence", key: "example_sentence", ellipsis: true as const }] : []),
                    { title: "次數", dataIndex: "count", key: "count", width: 70, render: (v: number) => <Tag color="blue">{v}</Tag> },
                  ]}
                  rowKey="term"
                  pagination={false}
                  size="small"
                  scroll={{ y: 300 }}
                />
                <Space>
                  <Button onClick={handleDownloadExportCsv}>下載 CSV</Button>
                  <Button onClick={handleDownloadExportPdf}>下載 PDF</Button>
                </Space>
              </>
            )}
          </Space>
        </Modal>

        <Modal
          title="複習統計"
          open={statsOpen}
          onCancel={() => setStatsOpen(false)}
          footer={null}
          width={650}
        >
          {statsLoading ? (
            <div style={{ textAlign: "center", padding: 24 }}><Spin /></div>
          ) : stats ? (
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-around" }}>
                <Statistic title="總複習次數" value={stats.total_reviews} />
                <Statistic title="記得" value={stats.remember_count} valueStyle={{ color: "#52c41a" }} />
                <Statistic title="不確定" value={stats.unsure_count} valueStyle={{ color: "#faad14" }} />
                <Statistic title="忘記" value={stats.forget_count} valueStyle={{ color: "#ff4d4f" }} />
              </div>
              <Tabs
                defaultActiveKey="forget"
                items={[
                  { key: "forget", label: "忘記", color: "red", data: stats.forget_words },
                  { key: "unsure", label: "不確定", color: "orange", data: stats.unsure_words },
                  { key: "remember", label: "記得", color: "green", data: stats.remember_words },
                ].map((category) => ({
                  key: category.key,
                  label: category.label,
                  children: (
                    <Tabs
                      defaultActiveKey="today"
                      size="small"
                      items={[
                        { key: "today", label: "本日", list: category.data.today },
                        { key: "week", label: "本週", list: category.data.week },
                        { key: "month", label: "本月", list: category.data.month },
                        { key: "quarter", label: "本季", list: category.data.quarter },
                        { key: "all", label: "歷史至今", list: category.data.all },
                      ].map((period) => ({
                        key: period.key,
                        label: period.label,
                        children: period.list.length > 0 ? (
                          <Table
                            dataSource={period.list}
                            columns={[
                              {
                                title: "單字",
                                dataIndex: "term",
                                key: "term",
                                width: 150,
                                render: (text: string, record: ReviewWordStat) => (
                                  <Space size={4}>
                                    <Tooltip
                                      title={
                                        <div>
                                          {record.reading && <div>{record.reading}</div>}
                                          {record.mnemonic && <div>{record.mnemonic}</div>}
                                          {!record.reading && !record.mnemonic && <div>無額外資訊</div>}
                                        </div>
                                      }
                                    >
                                      <span style={{ cursor: "pointer", borderBottom: "1px dashed #999" }}>{text}</span>
                                    </Tooltip>
                                    <SpeakButton text={text} />
                                  </Space>
                                ),
                              },
                              { title: "中文", dataIndex: "definition", key: "definition", width: 150 },
                              {
                                title: "次數",
                                dataIndex: "count",
                                key: "count",
                                width: 80,
                                render: (v: number) => <Tag color={category.color}>{v}</Tag>,
                              },
                            ]}
                            rowKey="term"
                            pagination={false}
                            size="small"
                            scroll={{ y: 350 }}
                          />
                        ) : (
                          <Text type="secondary">此期間沒有紀錄</Text>
                        ),
                      }))}
                    />
                  ),
                }))}
              />
              {stats.weekly_trend.length > 0 && (
                <>
                  <Title level={5}>每週複習趨勢</Title>
                  <Table
                    dataSource={stats.weekly_trend}
                    columns={[
                      {
                        title: "週間",
                        key: "week",
                        width: 180,
                        render: (_: unknown, r: { week_start: string; week_end: string }) =>
                          `${r.week_start} ~ ${r.week_end}`,
                      },
                      {
                        title: "記得",
                        dataIndex: "remember",
                        width: 80,
                        render: (v: number) => <Tag color="green">{v}</Tag>,
                      },
                      {
                        title: "不確定",
                        dataIndex: "unsure",
                        width: 80,
                        render: (v: number) => <Tag color="orange">{v}</Tag>,
                      },
                      {
                        title: "忘記",
                        dataIndex: "forget",
                        width: 80,
                        render: (v: number) => <Tag color="red">{v}</Tag>,
                      },
                      { title: "總計", dataIndex: "total", width: 80 },
                    ]}
                    rowKey="week_start"
                    pagination={false}
                    size="small"
                    scroll={{ y: 300 }}
                  />
                </>
              )}
            </Space>
          ) : null}
        </Modal>
      </div>
    );
  }

  // --- Done Phase ---
  if (phase === "done") {
    const total = rememberCount + unsureCount + forgetCount;
    return (
      <div style={{ maxWidth: 600, margin: "0 auto", padding: 24 }}>
        <Title level={2}>複習完成</Title>
        <Card>
          {total === 0 ? (
            <Text>目前沒有符合條件的單字可以複習。</Text>
          ) : (
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-around" }}>
                <Statistic
                  title="記得"
                  value={rememberCount}
                  prefix={<CheckCircleOutlined style={{ color: "#52c41a" }} />}
                  valueStyle={{ color: "#52c41a" }}
                />
                <Statistic
                  title="不確定"
                  value={unsureCount}
                  prefix={<QuestionCircleOutlined style={{ color: "#faad14" }} />}
                  valueStyle={{ color: "#faad14" }}
                />
                <Statistic
                  title="忘記"
                  value={forgetCount}
                  prefix={<CloseCircleOutlined style={{ color: "#ff4d4f" }} />}
                  valueStyle={{ color: "#ff4d4f" }}
                />
              </div>
              <Progress
                percent={100}
                success={{ percent: Math.round((rememberCount / total) * 100) }}
                strokeColor="#faad14"
                format={() => `${total} 個`}
              />
            </Space>
          )}
          <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
            <Button icon={<ReloadOutlined />} onClick={handleStart} type="primary">
              再來一輪
            </Button>
            <Button onClick={() => setPhase("settings")}>回設定</Button>
          </div>
        </Card>
      </div>
    );
  }

  // --- Review Phase (Flashcard) ---
  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Title level={2} style={{ margin: 0 }}>複習</Title>
        <Text type="secondary">
          {currentIndex + 1} / {words.length}
        </Text>
      </div>

      <Progress
        percent={Math.round(((currentIndex + 1) / words.length) * 100)}
        showInfo={false}
        style={{ marginBottom: 16 }}
      />

      {/* Flashcard */}
      <Card
        style={{
          minHeight: 320,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          cursor: !flipped ? "pointer" : "default",
          background: flipped ? "#fafafa" : "#fff",
        }}
        onClick={!flipped ? handleFlip : undefined}
      >
        {/* Term - always visible */}
        <Title level={1} style={{ marginBottom: 8, fontSize: 42 }}>
          {currentWord?.term}
        </Title>
        {currentWord && (
          <Button
            type="default"
            icon={<SoundOutlined />}
            size="large"
            onClick={(e) => {
              e.stopPropagation();
              const u = new SpeechSynthesisUtterance(currentWord.term);
              u.lang = "ja-JP";
              u.rate = 0.9;
              speechSynthesis.cancel();
              speechSynthesis.speak(u);
            }}
            style={{ marginBottom: flipped ? 24 : 0 }}
          >
            發音
          </Button>
        )}

        {/* Flipped content */}
        {flipped && currentWord && (
          <Space direction="vertical" size="middle">
            {currentWord.reading && (
              <Text style={{ fontSize: 20, color: "#666" }}>{currentWord.reading}</Text>
            )}
            {currentWord.definition && (
              <Title level={3} style={{ margin: 0, color: "#1890ff" }}>
                {currentWord.definition}
              </Title>
            )}
            {currentWord.mnemonic && (
              <Tag color="orange" style={{ fontSize: 16, padding: "4px 12px" }}>
                {currentWord.mnemonic}
              </Tag>
            )}
          </Space>
        )}

        {!flipped && (
          <Text type="secondary" style={{ marginTop: 24, fontSize: 16 }}>
            按空白鍵翻牌
          </Text>
        )}
      </Card>

      {/* Answer buttons */}
      {flipped && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
            <Button
              size="large"
              icon={<ArrowLeftOutlined />}
              onClick={() => handleAnswer("remember")}
              style={{ background: "#f6ffed", borderColor: "#52c41a", color: "#52c41a", width: 140 }}
            >
              記得 ←
            </Button>
            <Button
              size="large"
              icon={<ArrowUpOutlined />}
              onClick={() => handleAnswer("unsure")}
              style={{ background: "#fffbe6", borderColor: "#faad14", color: "#faad14", width: 140 }}
            >
              不確定 ↑
            </Button>
            <Button
              size="large"
              icon={<ArrowRightOutlined />}
              onClick={() => handleAnswer("forget")}
              style={{ background: "#fff2f0", borderColor: "#ff4d4f", color: "#ff4d4f", width: 140 }}
            >
              忘記 →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

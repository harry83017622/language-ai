import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
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
  Typography,
} from "antd";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  QuestionCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import type { ReviewWord, ReviewStats } from "../api";
import { getReviewWords, logReview, getReviewStats } from "../api";

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
          </Space>
        </Card>

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
                      defaultActiveKey="week"
                      size="small"
                      items={[
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
                              { title: "單字", dataIndex: "english", key: "english", width: 150 },
                              { title: "中文", dataIndex: "chinese", key: "chinese", width: 150 },
                              {
                                title: "次數",
                                dataIndex: "count",
                                key: "count",
                                width: 80,
                                render: (v: number) => <Tag color={category.color}>{v}</Tag>,
                              },
                            ]}
                            rowKey="english"
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
        {/* English - always visible */}
        <Title level={1} style={{ marginBottom: flipped ? 24 : 0, fontSize: 42 }}>
          {currentWord?.english}
        </Title>

        {/* Flipped content */}
        {flipped && currentWord && (
          <Space direction="vertical" size="middle">
            {currentWord.kk_phonetic && (
              <Text style={{ fontSize: 20, color: "#666" }}>{currentWord.kk_phonetic}</Text>
            )}
            {currentWord.chinese && (
              <Title level={3} style={{ margin: 0, color: "#1890ff" }}>
                {currentWord.chinese}
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

import { useEffect, useState } from "react";
import {
  AutoComplete,
  Button,
  Card,
  Checkbox,
  Collapse,
  Input,
  message,
  Space,
  Tag,
  Typography,
} from "antd";
import { SendOutlined } from "@ant-design/icons";
import type { WordGroupSummary, ArticleSummary, RecentFile } from "../api";
import { listWordGroups, listArticles, getRecentFiles, sendEmail } from "../api";

const { Title, Text } = Typography;
const { TextArea } = Input;

const RECIPIENTS_KEY = "email_recent_recipients";

function loadRecentRecipients(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECIPIENTS_KEY) || "[]");
  } catch { return []; }
}

function saveRecipient(email: string) {
  const list = loadRecentRecipients().filter((e) => e !== email);
  list.unshift(email);
  localStorage.setItem(RECIPIENTS_KEY, JSON.stringify(list.slice(0, 3)));
}

export default function EmailPage() {
  const [toList, setToList] = useState<string[]>(() => {
    const recent = loadRecentRecipients();
    return recent.length > 0 ? [recent[0]] : [""];
  });
  const [recentRecipients, setRecentRecipients] = useState<string[]>(loadRecentRecipients());
  const [subject, setSubject] = useState("");
  const [customText, setCustomText] = useState("");
  const [sending, setSending] = useState(false);

  // Word groups
  const [groups, setGroups] = useState<WordGroupSummary[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());

  // Articles
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [selectedArticleIds, setSelectedArticleIds] = useState<Set<string>>(new Set());

  // Recent files
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    listWordGroups().then(setGroups).catch(() => {});
    listArticles().then(setArticles).catch(() => {});
    getRecentFiles().then(setRecentFiles).catch(() => {});
  }, []);

  const handleSend = async () => {
    const recipients = toList.map((t) => t.trim()).filter(Boolean);
    if (!recipients.length) {
      message.warning("請輸入至少一個收件人 email");
      return;
    }
    if (selectedGroupIds.size === 0 && selectedArticleIds.size === 0 && selectedFileIds.size === 0 && !customText.trim()) {
      message.warning("請選擇至少一項內容");
      return;
    }

    setSending(true);
    try {
      await sendEmail({
        to: recipients.join(","),
        subject: subject.trim(),
        group_ids: [...selectedGroupIds],
        article_ids: [...selectedArticleIds],
        file_ids: [...selectedFileIds],
        custom_text: customText.trim(),
      });
      recipients.forEach(saveRecipient);
      setRecentRecipients(loadRecentRecipients());
      message.success("信件已發送！");
    } catch (e: any) {
      message.error("發信失敗：" + (e?.response?.data?.detail || e.message));
    } finally {
      setSending(false);
    }
  };

  const toggleGroup = (id: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleArticle = (id: string) => {
    setSelectedArticleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleFile = (id: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <Title level={2}>寄信</Title>

      <Card>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <div>
            <Text strong>收件人：</Text>
            {toList.map((addr, idx) => (
              <Space key={idx} style={{ width: "100%", marginTop: 4 }}>
                <AutoComplete
                  value={addr}
                  onChange={(val) => setToList((prev) => prev.map((v, i) => (i === idx ? val : v)))}
                  options={recentRecipients.map((r) => ({ value: r }))}
                  placeholder="email@example.com"
                  style={{ flex: 1, minWidth: 300 }}
                  filterOption={(input, option) => !input || (option?.value ?? "").toLowerCase().includes(input.toLowerCase())}
                />
                {toList.length > 1 && (
                  <Button size="small" danger onClick={() => setToList((prev) => prev.filter((_, i) => i !== idx))}>
                    移除
                  </Button>
                )}
              </Space>
            ))}
            <Button size="small" type="dashed" onClick={() => setToList((prev) => [...prev, ""])} style={{ marginTop: 4 }}>
              + 新增收件人
            </Button>
          </div>
          <div>
            <Text strong>信件主旨：</Text>
            <Input
              placeholder="選填，預設為 日文單字工具"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={{ marginTop: 4 }}
            />
          </div>

          <Collapse
            defaultActiveKey={["groups"]}
            items={[
              {
                key: "groups",
                label: `單字組 (已選 ${selectedGroupIds.size}/${groups.length})`,
                children: (
                  <div style={{ maxHeight: 250, overflow: "auto" }}>
                    <div style={{ marginBottom: 8 }}>
                      <Button
                        size="small"
                        onClick={() => setSelectedGroupIds(new Set(groups.slice(0, 10).map((g) => g.id)))}
                      >
                        選最近 10 筆
                      </Button>
                      <Button
                        size="small"
                        onClick={() => setSelectedGroupIds(new Set(groups.map((g) => g.id)))}
                        style={{ marginLeft: 8 }}
                      >
                        全選
                      </Button>
                      <Button
                        size="small"
                        onClick={() => setSelectedGroupIds(new Set())}
                        style={{ marginLeft: 8 }}
                      >
                        取消全選
                      </Button>
                    </div>
                    {groups.map((g) => (
                      <div key={g.id} style={{ padding: "4px 0" }}>
                        <Checkbox checked={selectedGroupIds.has(g.id)} onChange={() => toggleGroup(g.id)}>
                          {g.title} <Tag>{g.saved_date}</Tag> <Text type="secondary">{g.word_count} 個單字</Text>
                        </Checkbox>
                      </div>
                    ))}
                    {groups.length === 0 && <Text type="secondary">沒有單字組</Text>}
                  </div>
                ),
              },
              {
                key: "articles",
                label: `文章/對話 (已選 ${selectedArticleIds.size}/${articles.length})`,
                children: (
                  <div style={{ maxHeight: 250, overflow: "auto" }}>
                    <div style={{ marginBottom: 8 }}>
                      <Button size="small" onClick={() => setSelectedArticleIds(new Set(articles.map((a) => a.id)))}>
                        全選
                      </Button>
                      <Button size="small" onClick={() => setSelectedArticleIds(new Set())} style={{ marginLeft: 8 }}>
                        取消全選
                      </Button>
                    </div>
                    {articles.map((a) => (
                      <div key={a.id} style={{ padding: "4px 0" }}>
                        <Checkbox checked={selectedArticleIds.has(a.id)} onChange={() => toggleArticle(a.id)}>
                          {a.title} <Tag color={a.mode === "article" ? "blue" : "green"}>
                            {a.mode === "article" ? "文章" : "對話"}
                          </Tag>
                        </Checkbox>
                      </div>
                    ))}
                    {articles.length === 0 && <Text type="secondary">沒有文章/對話</Text>}
                  </div>
                ),
              },
              {
                key: "files",
                label: `附件檔案 (已選 ${selectedFileIds.size}/${recentFiles.length})`,
                children: (
                  <div style={{ maxHeight: 250, overflow: "auto" }}>
                    <div style={{ marginBottom: 8 }}>
                      <Button size="small" onClick={() => setSelectedFileIds(new Set(recentFiles.map((f) => f.id)))}>
                        全選
                      </Button>
                      <Button size="small" onClick={() => setSelectedFileIds(new Set())} style={{ marginLeft: 8 }}>
                        取消全選
                      </Button>
                    </div>
                    {recentFiles.map((f) => (
                      <div key={f.id} style={{ padding: "4px 0" }}>
                        <Checkbox checked={selectedFileIds.has(f.id)} onChange={() => toggleFile(f.id)}>
                          {f.filename} <Tag>{f.file_type.toUpperCase()}</Tag>
                          <Text type="secondary">{new Date(f.created_at).toLocaleString()}</Text>
                        </Checkbox>
                      </div>
                    ))}
                    {recentFiles.length === 0 && <Text type="secondary">還沒有下載過檔案</Text>}
                  </div>
                ),
              },
              {
                key: "custom",
                label: "自訂內容",
                children: (
                  <TextArea
                    placeholder="輸入自訂文字內容（選填）"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    autoSize={{ minRows: 3, maxRows: 8 }}
                  />
                ),
              },
            ]}
          />

          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            loading={sending}
            size="large"
            block
          >
            發送信件
          </Button>
        </Space>
      </Card>
    </div>
  );
}

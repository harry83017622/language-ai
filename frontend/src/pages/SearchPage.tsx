import { useState } from "react";
import { Button, Card, Input, message, Table, Tag, Typography } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { WordSearchResult } from "../api";
import { searchWords } from "../api";

const { Title } = Typography;

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WordSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (query.trim().length < 4) {
      message.warning("請輸入至少 4 個字母");
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const data = await searchWords(query.trim());
      setResults(data);
    } catch (e: any) {
      message.error("搜尋失敗：" + (e?.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: "英文", dataIndex: "english", width: 130 },
    { title: "中文", dataIndex: "chinese", width: 120 },
    { title: "KK 音標", dataIndex: "kk_phonetic", width: 160 },
    { title: "諧音記憶", dataIndex: "mnemonic", width: 140 },
    { title: "例句", dataIndex: "example_sentence", ellipsis: true },
    {
      title: "來源",
      width: 200,
      render: (_: unknown, record: WordSearchResult) => (
        <>
          <Tag color="blue">{record.group_title}</Tag>
          <Tag>{record.group_saved_date}</Tag>
        </>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <Title level={2}>搜尋單字</Title>

      <Card style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="輸入至少 4 個字母搜尋（模糊比對）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onSearch={handleSearch}
          enterButton={<Button type="primary" icon={<SearchOutlined />} loading={loading}>搜尋</Button>}
          style={{ maxWidth: 500 }}
        />
      </Card>

      {searched && (
        <Table
          dataSource={results}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: "沒有找到符合的單字" }}
          scroll={{ x: 900 }}
        />
      )}
    </div>
  );
}

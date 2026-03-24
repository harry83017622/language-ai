import { useState } from "react";
import { Avatar, Button, Card, ConfigProvider, Layout, Menu, message, Spin, theme, Typography } from "antd";
import { BookOutlined, FormOutlined, HistoryOutlined, LogoutOutlined, SearchOutlined, SoundOutlined, UserOutlined } from "@ant-design/icons";
import { GoogleLogin } from "@react-oauth/google";
import zhTW from "antd/locale/zh_TW";
import { useAuth } from "./auth";
import CreatePage from "./pages/CreatePage";
import HistoryPage from "./pages/HistoryPage";
import SearchPage from "./pages/SearchPage";
import ArticlePage from "./pages/ArticlePage";
import ReviewPage from "./pages/ReviewPage";

const { Header, Content } = Layout;
const { Title } = Typography;

function App() {
  const [page, setPage] = useState<"create" | "history" | "search" | "article" | "review">("create");
  const { user, login, logout, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <ConfigProvider locale={zhTW} theme={{ algorithm: theme.defaultAlgorithm }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100vh",
            background: "#f5f5f5",
          }}
        >
          <Card style={{ textAlign: "center", padding: "24px 48px" }}>
            <Title level={3} style={{ marginBottom: 24 }}>English Vocab Tool</Title>
            <GoogleLogin
              onSuccess={(response) => {
                if (response.credential) {
                  login(response.credential).catch(() => message.error("登入失敗"));
                }
              }}
              onError={() => message.error("Google 登入失敗")}
            />
          </Card>
        </div>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider locale={zhTW} theme={{ algorithm: theme.defaultAlgorithm }}>
      <Layout style={{ minHeight: "100vh" }}>
        <Header style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              color: "#fff",
              fontSize: 18,
              fontWeight: 600,
              marginRight: 32,
              whiteSpace: "nowrap",
            }}
          >
            English Vocab Tool
          </div>
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[page]}
            onClick={({ key }) => setPage(key as "create" | "history" | "search" | "article" | "review")}
            items={[
              { key: "create", icon: <BookOutlined />, label: "新增單字" },
              { key: "history", icon: <HistoryOutlined />, label: "歷史紀錄" },
              { key: "search", icon: <SearchOutlined />, label: "搜尋單字" },
              { key: "article", icon: <SoundOutlined />, label: "文章生成" },
              { key: "review", icon: <FormOutlined />, label: "複習" },
            ]}
            style={{ flex: 1 }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar
              src={user.picture}
              icon={!user.picture ? <UserOutlined /> : undefined}
              size="small"
            />
            <span style={{ color: "#fff", fontSize: 14 }}>{user.name}</span>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={logout}
              style={{ color: "#fff" }}
              size="small"
            >
              登出
            </Button>
          </div>
        </Header>
        <Content style={{ background: "#f5f5f5" }}>
          {page === "create" && <CreatePage />}
          {page === "history" && <HistoryPage />}
          {page === "search" && <SearchPage />}
          {page === "article" && <ArticlePage />}
          {page === "review" && <ReviewPage />}
        </Content>
      </Layout>
    </ConfigProvider>
  );
}

export default App;

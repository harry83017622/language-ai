import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock all page components to avoid deep dependency chains
vi.mock("../pages/CreatePage", () => ({ default: () => <div data-testid="create-page">CreatePage</div> }));
vi.mock("../pages/HistoryPage", () => ({ default: () => <div data-testid="history-page">HistoryPage</div> }));
vi.mock("../pages/SearchPage", () => ({ default: () => <div data-testid="search-page">SearchPage</div> }));
vi.mock("../pages/ArticlePage", () => ({ default: () => <div data-testid="article-page">ArticlePage</div> }));
vi.mock("../pages/ReviewPage", () => ({ default: () => <div data-testid="review-page">ReviewPage</div> }));
vi.mock("../pages/EmailPage", () => ({ default: () => <div data-testid="email-page">EmailPage</div> }));
vi.mock("@react-oauth/google", () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  GoogleLogin: () => <button data-testid="google-login">Google Login</button>,
}));

// Mock auth with logged-in user
const mockLogout = vi.fn();
vi.mock("../auth", () => ({
  useAuth: () => ({
    user: { id: "1", email: "test@test.com", name: "Test User", picture: null },
    token: "test-token",
    login: vi.fn(),
    logout: mockLogout,
    loading: false,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import App from "../App";

describe("App", () => {
  beforeEach(() => {
    window.location.hash = "";
    vi.clearAllMocks();
  });

  it("renders header with app name", () => {
    render(<App />);
    expect(screen.getByText("English Vocab Tool")).toBeInTheDocument();
  });

  it("renders user name and logout button", () => {
    render(<App />);
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("登出")).toBeInTheDocument();
  });

  it("shows CreatePage by default", () => {
    render(<App />);
    expect(screen.getByTestId("create-page")).toBeInTheDocument();
  });

  it("navigates to history page via menu", async () => {
    render(<App />);
    await userEvent.click(screen.getByText("歷史紀錄"));
    expect(screen.getByTestId("history-page")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/history");
  });

  it("navigates to search page via menu", async () => {
    render(<App />);
    await userEvent.click(screen.getByText("搜尋單字"));
    expect(screen.getByTestId("search-page")).toBeInTheDocument();
  });

  it("navigates to article page via menu", async () => {
    render(<App />);
    await userEvent.click(screen.getByText("文章生成"));
    expect(screen.getByTestId("article-page")).toBeInTheDocument();
  });

  it("navigates to review page via menu", async () => {
    render(<App />);
    await userEvent.click(screen.getByText("複習"));
    expect(screen.getByTestId("review-page")).toBeInTheDocument();
  });

  it("navigates to email page via menu", async () => {
    render(<App />);
    await userEvent.click(screen.getByText("寄信"));
    expect(screen.getByTestId("email-page")).toBeInTheDocument();
  });

  it("restores page from URL hash", () => {
    window.location.hash = "#/review";
    render(<App />);
    expect(screen.getByTestId("review-page")).toBeInTheDocument();
  });

  it("calls logout on button click", async () => {
    render(<App />);
    await userEvent.click(screen.getByText("登出"));
    expect(mockLogout).toHaveBeenCalled();
  });
});

// Note: "not logged in" test requires separate mock setup and is covered by manual testing

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../api", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  generateArticle: vi.fn().mockResolvedValue({
    title: "A Day at Work",
    sentences: [
      { speaker: null, text: "Today was busy.", chinese: "今天很忙。" },
      { speaker: null, text: "I had meetings.", chinese: "我開了會議。" },
    ],
    used_words: ["busy", "meetings"],
  }),
  downloadAudio: vi.fn().mockResolvedValue(new Blob(["mp3"])),
  downloadVideo: vi.fn().mockResolvedValue(new Blob(["mp4"])),
  saveArticle: vi.fn().mockResolvedValue({ id: "a1" }),
  listArticles: vi.fn().mockResolvedValue([]),
  getArticle: vi.fn(),
  deleteArticle: vi.fn(),
}));

vi.mock("../utils/download", () => ({
  downloadBlob: vi.fn(),
  extractFilename: vi.fn().mockReturnValue("test.pdf"),
}));

import ArticlePage from "../pages/ArticlePage";

describe("ArticlePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders input area and controls", () => {
    render(<ArticlePage />);
    expect(screen.getByText("文章生成")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/輸入英文單字/)).toBeInTheDocument();
    expect(screen.getByText("生成")).toBeInTheDocument();
  });

  it("has mode selector (article/dialogue)", () => {
    render(<ArticlePage />);
    expect(screen.getByText("文章")).toBeInTheDocument();
  });

  it("has ratio slider", () => {
    render(<ArticlePage />);
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("generates article and displays results", async () => {
    render(<ArticlePage />);
    const textarea = screen.getByPlaceholderText(/輸入英文單字/);
    await userEvent.type(textarea, "busy\nmeetings");
    await userEvent.click(screen.getByText("生成"));

    expect(await screen.findByText("A Day at Work", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("今天很忙。")).toBeInTheDocument();
  });

  it("shows download and copy buttons after generation", async () => {
    render(<ArticlePage />);
    await userEvent.type(screen.getByPlaceholderText(/輸入英文單字/), "busy");
    await userEvent.click(screen.getByText("生成"));

    expect(await screen.findByText("下載 MP3", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("下載 MP4")).toBeInTheDocument();
    expect(screen.getByText("下載 TXT")).toBeInTheDocument();
    expect(screen.getByText("下載 PDF")).toBeInTheDocument();
    expect(screen.getByText("複製文字")).toBeInTheDocument();
  });

  it("shows used words as tags", async () => {
    render(<ArticlePage />);
    await userEvent.type(screen.getByPlaceholderText(/輸入英文單字/), "busy");
    await userEvent.click(screen.getByText("生成"));

    expect(await screen.findByText("A Day at Work", {}, { timeout: 5000 })).toBeInTheDocument();
    // used_words shown as tags
    const tags = document.querySelectorAll(".ant-tag");
    expect(tags.length).toBeGreaterThanOrEqual(2);
  });

  it("has load saved button", () => {
    render(<ArticlePage />);
    expect(screen.getByText("載入已儲存")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  generateWords: vi.fn().mockResolvedValue([
    { english: "test", chinese: "測試", kk_phonetic: "[tɛst]", example_sentence: "A test.", mnemonic_options: ["鐵絲特", "太死的", "踢死他"] },
  ]),
  saveWordGroup: vi.fn().mockResolvedValue({ id: "1" }),
  uploadCsv: vi.fn().mockResolvedValue({
    words: [
      { english: "hello", chinese: "你好", kk_phonetic: null, mnemonic: null, example_sentence: null, mnemonic_options: ["哈囉"] },
    ],
    detected_columns: { english: "english", chinese: "chinese" },
  }),
}));

vi.mock("../components/SpeakButton", () => ({
  default: () => <button data-testid="speak">🔊</button>,
}));

import CreatePage from "../pages/CreatePage";

describe("CreatePage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders with title, date, and input table", () => {
    render(<CreatePage />);
    expect(screen.getByText("新增單字")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/標題/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ambulance/)).toBeInTheDocument();
  });

  it("adds a new row on button click", async () => {
    render(<CreatePage />);
    const addBtn = screen.getByText("新增一列");
    await userEvent.click(addBtn);
    // Should have 2 english inputs
    const inputs = screen.getAllByPlaceholderText(/ambulance/);
    expect(inputs.length).toBe(2);
  });

  it("shows generate button", () => {
    render(<CreatePage />);
    expect(screen.getByText("送出生成")).toBeInTheDocument();
  });

  it("shows CSV upload button", () => {
    render(<CreatePage />);
    expect(screen.getByText("匯入 CSV")).toBeInTheDocument();
  });

  it("shows save button", () => {
    render(<CreatePage />);
    expect(screen.getByText("儲存到資料庫")).toBeInTheDocument();
  });

  it("shows clear all button", () => {
    render(<CreatePage />);
    expect(screen.getByText("清除全部")).toBeInTheDocument();
  });

  it("shows draft management buttons", () => {
    render(<CreatePage />);
    expect(screen.getByText("新建")).toBeInTheDocument();
    expect(screen.getByText("暫存")).toBeInTheDocument();
  });

  it("saves draft to localStorage", async () => {
    render(<CreatePage />);
    await userEvent.click(screen.getByText("暫存"));
    const drafts = JSON.parse(localStorage.getItem("createPage_drafts")!);
    expect(Object.keys(drafts).length).toBeGreaterThanOrEqual(1);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGenerateWords = vi.fn();
const mockSaveWordGroup = vi.fn();
const mockUploadCsv = vi.fn();

vi.mock("../api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  generateWords: (...args: unknown[]) => mockGenerateWords(...args),
  saveWordGroup: (...args: unknown[]) => mockSaveWordGroup(...args),
  uploadCsv: (...args: unknown[]) => mockUploadCsv(...args),
}));

vi.mock("../components/SpeakButton", () => ({
  default: () => <button data-testid="speak">🔊</button>,
}));

import CreatePage from "../pages/CreatePage";

describe("CreatePage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockGenerateWords.mockResolvedValue([
      { english: "test", chinese: "測試", kk_phonetic: "[tɛst]", example_sentence: "A test.", mnemonic_options: ["鐵絲特", "太死的", "踢死他"] },
    ]);
    mockSaveWordGroup.mockResolvedValue({ id: "1" });
    mockUploadCsv.mockResolvedValue({
      words: [{ english: "hello", chinese: "你好", kk_phonetic: null, mnemonic: null, example_sentence: null, mnemonic_options: ["哈囉"] }],
      detected_columns: { english: "english", chinese: "chinese" },
    });
  });

  // --- Render ---
  it("renders with title, date, and input table", () => {
    render(<CreatePage />);
    expect(screen.getByText("新增單字")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/標題/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ambulance/)).toBeInTheDocument();
  });

  it("shows all action buttons", () => {
    render(<CreatePage />);
    expect(screen.getByText("送出生成")).toBeInTheDocument();
    expect(screen.getByText("匯入 CSV")).toBeInTheDocument();
    expect(screen.getByText("儲存到資料庫")).toBeInTheDocument();
    expect(screen.getByText("清除全部")).toBeInTheDocument();
    expect(screen.getByText("新建")).toBeInTheDocument();
    expect(screen.getByText("暫存")).toBeInTheDocument();
  });

  // --- Row management ---
  it("adds a new row", async () => {
    render(<CreatePage />);
    await userEvent.click(screen.getByText("新增一列"));
    expect(screen.getAllByPlaceholderText(/ambulance/).length).toBe(2);
  });

  it("removes a row", async () => {
    render(<CreatePage />);
    await userEvent.click(screen.getByText("新增一列"));
    expect(screen.getAllByPlaceholderText(/ambulance/).length).toBe(2);
    const deleteBtns = screen.getAllByRole("button").filter(b => b.querySelector(".anticon-delete"));
    await userEvent.click(deleteBtns[0]);
    expect(screen.getAllByPlaceholderText(/ambulance/).length).toBe(1);
  });

  // --- Generate flow ---
  it("calls generateWords on submit and shows results", async () => {
    render(<CreatePage />);
    const input = screen.getByPlaceholderText(/ambulance/);
    await userEvent.type(input, "test");
    await userEvent.click(screen.getByText("送出生成"));

    await waitFor(() => {
      expect(mockGenerateWords).toHaveBeenCalled();
    });

    // After generation, chinese field should show as editable input
    await waitFor(() => {
      expect(screen.getByDisplayValue("測試")).toBeInTheDocument();
    });
  });

  it("shows mnemonic options after generation", async () => {
    render(<CreatePage />);
    await userEvent.type(screen.getByPlaceholderText(/ambulance/), "test");
    await userEvent.click(screen.getByText("送出生成"));

    await waitFor(() => {
      expect(screen.getByText("鐵絲特")).toBeInTheDocument();
      expect(screen.getByText("太死的")).toBeInTheDocument();
      expect(screen.getByText("踢死他")).toBeInTheDocument();
    });
  });

  it("warns when no words entered", async () => {
    render(<CreatePage />);
    await userEvent.click(screen.getByText("送出生成"));
    expect(mockGenerateWords).not.toHaveBeenCalled();
  });

  // --- Save flow ---
  it("saves word group to DB", async () => {
    render(<CreatePage />);
    await userEvent.type(screen.getByPlaceholderText(/ambulance/), "test");
    await userEvent.click(screen.getByText("送出生成"));
    await waitFor(() => expect(screen.getByDisplayValue("測試")).toBeInTheDocument());

    await userEvent.type(screen.getByPlaceholderText(/標題/), "My Words");
    await userEvent.click(screen.getByText("儲存到資料庫"));

    await waitFor(() => {
      expect(mockSaveWordGroup).toHaveBeenCalledWith(expect.objectContaining({
        title: "My Words",
      }));
    });
  });

  it("warns when saving without title", async () => {
    render(<CreatePage />);
    await userEvent.type(screen.getByPlaceholderText(/ambulance/), "test");
    await userEvent.click(screen.getByText("送出生成"));
    await waitFor(() => expect(screen.getByDisplayValue("測試")).toBeInTheDocument());

    await userEvent.click(screen.getByText("儲存到資料庫"));
    expect(mockSaveWordGroup).not.toHaveBeenCalled();
  });

  // --- Draft management ---
  it("saves and loads draft", async () => {
    render(<CreatePage />);
    await userEvent.type(screen.getByPlaceholderText(/標題/), "Draft Title");
    await userEvent.click(screen.getByText("暫存"));

    const drafts = JSON.parse(localStorage.getItem("createPage_drafts")!);
    const names = Object.keys(drafts);
    expect(names.length).toBeGreaterThanOrEqual(1);
    expect(names[0]).toContain("Draft Title");
  });

  it("clears all on new button", async () => {
    render(<CreatePage />);
    await userEvent.type(screen.getByPlaceholderText(/標題/), "Something");
    await userEvent.click(screen.getByText("新建"));

    expect(screen.getByPlaceholderText(/標題/)).toHaveValue("");
  });
});

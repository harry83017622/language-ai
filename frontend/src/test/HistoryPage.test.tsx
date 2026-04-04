import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  listWordGroups: vi.fn().mockResolvedValue([
    { id: "g1", title: "TOEIC Lesson 1", saved_date: "2026-04-01", created_at: "2026-04-01T00:00:00Z", word_count: 5 },
    { id: "g2", title: "Daily Words", saved_date: "2026-04-02", created_at: "2026-04-02T00:00:00Z", word_count: 3 },
  ]),
  getWordGroup: vi.fn().mockResolvedValue({
    id: "g1", title: "TOEIC Lesson 1", saved_date: "2026-04-01", created_at: "2026-04-01T00:00:00Z",
    words: [
      { id: "w1", english: "apple", chinese: "蘋果", kk_phonetic: "[ˈæpəl]", mnemonic: "阿婆", example_sentence: "I eat an apple.", sort_order: 0, marked_for_review: false },
    ],
  }),
  deleteWordGroup: vi.fn().mockResolvedValue({}),
  updateWord: vi.fn().mockResolvedValue({}),
  batchMarkWords: vi.fn().mockResolvedValue({}),
  generateReviewVideo: vi.fn().mockResolvedValue(new Blob(["fake"])),
}));

vi.mock("../components/SpeakButton", () => ({
  default: ({ text }: { text: string }) => <button data-testid={`speak-${text}`}>🔊</button>,
}));

vi.mock("../utils/download", () => ({
  downloadBlob: vi.fn(),
  extractFilename: vi.fn().mockReturnValue("test.csv"),
}));

import HistoryPage from "../pages/HistoryPage";

describe("HistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders title and search bar", async () => {
    render(<HistoryPage />);
    expect(screen.getByText("歷史紀錄")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜尋標題")).toBeInTheDocument();
  });

  it("loads and displays word groups", async () => {
    render(<HistoryPage />);
    await waitFor(() => {
      expect(screen.getByText("TOEIC Lesson 1")).toBeInTheDocument();
      expect(screen.getByText("Daily Words")).toBeInTheDocument();
    });
  });

  it("has edit button for each group", async () => {
    render(<HistoryPage />);
    await waitFor(() => {
      const editBtns = screen.getAllByText("編輯");
      expect(editBtns.length).toBe(2);
    });
  });

  it("has download button for each group", async () => {
    render(<HistoryPage />);
    await waitFor(() => {
      const dlBtns = screen.getAllByText("下載");
      expect(dlBtns.length).toBe(2);
    });
  });

  it("opens edit modal on click", async () => {
    render(<HistoryPage />);
    await waitFor(() => expect(screen.getByText("TOEIC Lesson 1")).toBeInTheDocument());

    const editBtns = screen.getAllByText("編輯");
    await userEvent.click(editBtns[0]);

    await waitFor(() => {
      expect(screen.getByDisplayValue("apple")).toBeInTheDocument();
    });
  });

  it("shows save and review MP4 buttons in modal", async () => {
    render(<HistoryPage />);
    await waitFor(() => expect(screen.getByText("TOEIC Lesson 1")).toBeInTheDocument());

    await userEvent.click(screen.getAllByText("編輯")[0]);

    await waitFor(() => {
      expect(screen.getByText("儲存修改")).toBeInTheDocument();
      expect(screen.getByText(/生成複習 MP4/)).toBeInTheDocument();
    });
  });
});

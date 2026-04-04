import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSearchWords = vi.fn();
const mockUpdateWord = vi.fn();

vi.mock("../api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  searchWords: (...args: unknown[]) => mockSearchWords(...args),
  updateWord: (...args: unknown[]) => mockUpdateWord(...args),
}));

vi.mock("../components/SpeakButton", () => ({
  default: ({ text }: { text: string }) => <button data-testid={`speak-${text}`}>🔊</button>,
}));

import SearchPage from "../pages/SearchPage";

describe("SearchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchWords.mockResolvedValue([
      { id: "1", english: "application", chinese: "應用", kk_phonetic: "[æp]", mnemonic: "阿婆", example_sentence: "An app.", sort_order: 0, group_title: "TOEIC", group_saved_date: "2026-04-04", marked_for_review: false },
      { id: "2", english: "apple", chinese: "蘋果", kk_phonetic: null, mnemonic: null, example_sentence: null, sort_order: 0, group_title: "Daily", group_saved_date: "2026-04-03", marked_for_review: false },
    ]);
    mockUpdateWord.mockResolvedValue({});
  });

  it("renders search input", () => {
    render(<SearchPage />);
    expect(screen.getByPlaceholderText(/輸入至少 4 個字母/)).toBeInTheDocument();
  });

  it("warns when query is too short", async () => {
    render(<SearchPage />);
    const input = screen.getByPlaceholderText(/輸入至少 4 個字母/);
    await userEvent.type(input, "ab");
    await userEvent.click(screen.getByText("搜尋"));
    // searchWords should not be called
    expect(mockSearchWords).not.toHaveBeenCalled();
  });

  it("searches and displays results", async () => {
    render(<SearchPage />);
    const input = screen.getByPlaceholderText(/輸入至少 4 個字母/);
    await userEvent.type(input, "appl");
    await userEvent.click(screen.getByText("搜尋"));

    await waitFor(() => {
      expect(mockSearchWords).toHaveBeenCalledWith("appl");
      expect(screen.getByDisplayValue("application")).toBeInTheDocument();
      expect(screen.getByDisplayValue("apple")).toBeInTheDocument();
    });
  });

  it("shows source tags", async () => {
    render(<SearchPage />);
    await userEvent.type(screen.getByPlaceholderText(/輸入至少 4 個字母/), "appl");
    await userEvent.click(screen.getByText("搜尋"));

    await waitFor(() => {
      expect(screen.getByText("TOEIC")).toBeInTheDocument();
      expect(screen.getByText("Daily")).toBeInTheDocument();
    });
  });

  it("has speak buttons for each word", async () => {
    render(<SearchPage />);
    await userEvent.type(screen.getByPlaceholderText(/輸入至少 4 個字母/), "appl");
    await userEvent.click(screen.getByText("搜尋"));

    await waitFor(() => {
      expect(screen.getByTestId("speak-application")).toBeInTheDocument();
      expect(screen.getByTestId("speak-apple")).toBeInTheDocument();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock all API calls
vi.mock("../api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
  getReviewWords: vi.fn().mockResolvedValue([
    { id: "1", english: "apple", chinese: "蘋果", kk_phonetic: "[ˈæpəl]", mnemonic: "阿婆", example_sentence: "I eat an apple." },
    { id: "2", english: "banana", chinese: "香蕉", kk_phonetic: null, mnemonic: null, example_sentence: null },
  ]),
  logReview: vi.fn().mockResolvedValue(undefined),
  getReviewStats: vi.fn().mockResolvedValue({
    total_reviews: 0, remember_count: 0, unsure_count: 0, forget_count: 0,
    remember_words: { today: [], week: [], month: [], quarter: [], all: [] },
    unsure_words: { today: [], week: [], month: [], quarter: [], all: [] },
    forget_words: { today: [], week: [], month: [], quarter: [], all: [] },
    weekly_trend: [],
  }),
  exportTopWords: vi.fn().mockResolvedValue([]),
}));

// Mock SpeakButton to avoid Web Speech API
vi.mock("../components/SpeakButton", () => ({
  default: ({ text }: { text: string }) => <button data-testid="speak">{text}</button>,
}));

import ReviewPage from "../pages/ReviewPage";

describe("ReviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders settings phase with source and count options", () => {
    render(<ReviewPage />);
    expect(screen.getByText("複習")).toBeInTheDocument();
    expect(screen.getByText("全部單字")).toBeInTheDocument();
    expect(screen.getByText("已勾選的")).toBeInTheDocument();
    expect(screen.getByText("開始複習")).toBeInTheDocument();
  });

  it("starts review and shows flashcard", async () => {
    render(<ReviewPage />);
    const startBtn = screen.getByText("開始複習");
    await userEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByText("apple")).toBeInTheDocument();
    });
    // Should show "按空白鍵翻牌"
    expect(screen.getByText("按空白鍵翻牌")).toBeInTheDocument();
  });

  it("flips card on Space key", async () => {
    render(<ReviewPage />);
    await userEvent.click(screen.getByText("開始複習"));

    await waitFor(() => {
      expect(screen.getByText("apple")).toBeInTheDocument();
    });

    // Press Space to flip
    fireEvent.keyDown(window, { code: "Space" });

    await waitFor(() => {
      expect(screen.getByText("蘋果")).toBeInTheDocument();
      expect(screen.getByText("阿婆")).toBeInTheDocument();
    });
  });

  it("advances to next card on ArrowLeft (remember)", async () => {
    const { logReview } = await import("../api");
    render(<ReviewPage />);
    await userEvent.click(screen.getByText("開始複習"));

    await waitFor(() => expect(screen.getByText("apple")).toBeInTheDocument());

    // Flip
    fireEvent.keyDown(window, { code: "Space" });
    await waitFor(() => expect(screen.getByText("蘋果")).toBeInTheDocument());

    // Press Left (remember)
    fireEvent.keyDown(window, { code: "ArrowLeft" });

    await waitFor(() => {
      // Should advance to banana
      expect(screen.getByText("banana")).toBeInTheDocument();
    });
    expect(logReview).toHaveBeenCalledWith("1", "remember");
  });

  it("shows stats after completing all cards", async () => {
    render(<ReviewPage />);
    await userEvent.click(screen.getByText("開始複習"));

    // Card 1: flip + remember
    await waitFor(() => expect(screen.getByText("apple")).toBeInTheDocument());
    fireEvent.keyDown(window, { code: "Space" });
    await waitFor(() => expect(screen.getByText("蘋果")).toBeInTheDocument());
    fireEvent.keyDown(window, { code: "ArrowLeft" }); // remember

    // Card 2: flip + forget
    await waitFor(() => expect(screen.getByText("banana")).toBeInTheDocument());
    fireEvent.keyDown(window, { code: "Space" });
    fireEvent.keyDown(window, { code: "ArrowRight" }); // forget

    // Should show completion stats
    await waitFor(() => {
      expect(screen.getByText("複習完成")).toBeInTheDocument();
    });
  });

  it("does not advance before flipping", async () => {
    render(<ReviewPage />);
    await userEvent.click(screen.getByText("開始複習"));

    await waitFor(() => expect(screen.getByText("apple")).toBeInTheDocument());

    // Try ArrowLeft without flipping first — should not advance
    fireEvent.keyDown(window, { code: "ArrowLeft" });

    // Still on apple
    expect(screen.getByText("apple")).toBeInTheDocument();
    expect(screen.getByText("按空白鍵翻牌")).toBeInTheDocument();
  });
});

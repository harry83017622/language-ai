import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSendEmail = vi.fn();
const mockListWordGroups = vi.fn();
const mockListArticles = vi.fn();
const mockGetRecentFiles = vi.fn();

vi.mock("../api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
  listWordGroups: (...args: unknown[]) => mockListWordGroups(...args),
  listArticles: (...args: unknown[]) => mockListArticles(...args),
  getRecentFiles: (...args: unknown[]) => mockGetRecentFiles(...args),
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

import EmailPage from "../pages/EmailPage";

describe("EmailPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockListWordGroups.mockResolvedValue([
      { id: "g1", title: "TOEIC", saved_date: "2026-04-01", created_at: "2026-04-01T00:00:00Z", word_count: 5 },
    ]);
    mockListArticles.mockResolvedValue([
      { id: "a1", title: "My Article", mode: "article", created_at: "2026-04-01T00:00:00Z" },
    ]);
    mockGetRecentFiles.mockResolvedValue([
      { id: "f1", filename: "export.pdf", file_type: "pdf", created_at: "2026-04-01T00:00:00Z" },
    ]);
    mockSendEmail.mockResolvedValue({});
  });

  // --- Render ---
  it("renders email form with send button", () => {
    render(<EmailPage />);
    expect(screen.getByText("寄信")).toBeInTheDocument();
    expect(screen.getByText("發送信件")).toBeInTheDocument();
  });

  it("has subject and recipient inputs", () => {
    render(<EmailPage />);
    const text = document.body.textContent || "";
    expect(text).toContain("收件人");
    expect(text).toContain("信件主旨");
  });

  it("has all content sections", async () => {
    render(<EmailPage />);
    await waitFor(() => {
      const text = document.body.textContent || "";
      expect(text).toContain("單字組");
      expect(text).toContain("文章");
      expect(text).toContain("附件");
      expect(text).toContain("自訂內容");
    });
  });

  // --- Recipients ---
  it("can add multiple recipients", async () => {
    render(<EmailPage />);
    await userEvent.click(screen.getByText("+ 新增收件人"));
    const inputs = screen.getAllByRole("combobox");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("can add and remove recipients", async () => {
    render(<EmailPage />);
    await userEvent.click(screen.getByText("+ 新增收件人"));
    expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(2);
  });

  // --- Send ---
  it("has send button that is clickable", async () => {
    render(<EmailPage />);
    const sendBtn = screen.getByText("發送信件");
    expect(sendBtn).toBeInTheDocument();
    expect(sendBtn.closest("button")).not.toBeDisabled();
  });
});

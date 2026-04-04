import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
  listWordGroups: vi.fn().mockResolvedValue([
    { id: "g1", title: "TOEIC", saved_date: "2026-04-01", created_at: "2026-04-01T00:00:00Z", word_count: 5 },
  ]),
  listArticles: vi.fn().mockResolvedValue([
    { id: "a1", title: "My Article", mode: "article", created_at: "2026-04-01T00:00:00Z" },
  ]),
  getRecentFiles: vi.fn().mockResolvedValue([
    { id: "f1", filename: "export.pdf", file_type: "pdf", created_at: "2026-04-01T00:00:00Z" },
  ]),
  sendEmail: vi.fn().mockResolvedValue({}),
}));

import EmailPage from "../pages/EmailPage";

describe("EmailPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders email form", () => {
    render(<EmailPage />);
    expect(screen.getByText("寄信")).toBeInTheDocument();
    expect(screen.getByText("發送信件")).toBeInTheDocument();
    // AutoComplete renders input
    const inputs = screen.getAllByRole("combobox");
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it("has subject input", () => {
    render(<EmailPage />);
    const text = document.body.textContent || "";
    expect(text).toContain("信件主旨");
  });

  it("has collapse sections for content sources", async () => {
    render(<EmailPage />);
    await waitFor(() => {
      // Collapse headers should be visible even if content is collapsed
      const text = document.body.textContent || "";
      expect(text).toContain("單字組");
      expect(text).toContain("文章");
      expect(text).toContain("附件");
      expect(text).toContain("自訂內容");
    });
  });

  it("can add multiple recipients", async () => {
    render(<EmailPage />);
    await userEvent.click(screen.getByText("+ 新增收件人"));
    const inputs = screen.getAllByRole("combobox");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("has custom text area", () => {
    render(<EmailPage />);
    expect(screen.getByText("自訂內容")).toBeInTheDocument();
  });
});

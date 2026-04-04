import { describe, it, expect, vi, beforeEach } from "vitest";
import { downloadBlob, extractFilename } from "./download";

describe("extractFilename", () => {
  it("extracts UTF-8 encoded filename from Content-Disposition", () => {
    const headers = {
      "content-disposition": "attachment; filename*=UTF-8''test%20file.pdf",
    };
    expect(extractFilename(headers, "fallback.pdf")).toBe("test file.pdf");
  });

  it("extracts Chinese filename", () => {
    const headers = {
      "content-disposition":
        "attachment; filename*=UTF-8''%E5%96%AE%E5%AD%97%E7%B5%84.csv",
    };
    expect(extractFilename(headers, "fallback.csv")).toBe("單字組.csv");
  });

  it("returns fallback when no Content-Disposition", () => {
    expect(extractFilename({}, "fallback.pdf")).toBe("fallback.pdf");
  });

  it("returns fallback when header has no filename*", () => {
    const headers = { "content-disposition": "attachment" };
    expect(extractFilename(headers, "fallback.pdf")).toBe("fallback.pdf");
  });
});

describe("downloadBlob", () => {
  beforeEach(() => {
    // Mock DOM APIs
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("creates link, clicks, and revokes URL", () => {
    const clickMock = vi.fn();
    vi.spyOn(document, "createElement").mockReturnValue({
      href: "",
      download: "",
      click: clickMock,
    } as unknown as HTMLAnchorElement);

    const blob = new Blob(["test"], { type: "text/plain" });
    downloadBlob(blob, "test.txt");

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickMock).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});

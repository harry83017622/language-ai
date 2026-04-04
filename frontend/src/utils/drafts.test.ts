import { describe, it, expect, beforeEach } from "vitest";
import {
  loadAllDrafts,
  saveAllDrafts,
  getActiveDraftName,
  setActiveDraftName,
  saveDraft,
  deleteDraft,
  clearAllDrafts,
} from "./drafts";

beforeEach(() => {
  localStorage.clear();
});

describe("loadAllDrafts", () => {
  it("returns empty object when no drafts", () => {
    expect(loadAllDrafts()).toEqual({});
  });

  it("returns saved drafts", () => {
    const drafts = { "Draft 1": { rows: [], groupTitle: "Test", savedDate: "2026-04-04" } };
    localStorage.setItem("createPage_drafts", JSON.stringify(drafts));
    expect(loadAllDrafts()).toEqual(drafts);
  });

  it("returns empty on invalid JSON", () => {
    localStorage.setItem("createPage_drafts", "invalid");
    expect(loadAllDrafts()).toEqual({});
  });
});

describe("saveAllDrafts", () => {
  it("persists drafts to localStorage", () => {
    const drafts = { "My Draft": { rows: [{ english: "hello" }], groupTitle: "G1", savedDate: "2026-01-01" } };
    saveAllDrafts(drafts);
    expect(JSON.parse(localStorage.getItem("createPage_drafts")!)).toEqual(drafts);
  });
});

describe("active draft name", () => {
  it("returns null when no active draft", () => {
    expect(getActiveDraftName()).toBeNull();
  });

  it("sets and gets active draft name", () => {
    setActiveDraftName("Draft A");
    expect(getActiveDraftName()).toBe("Draft A");
  });

  it("clears active draft when set to null", () => {
    setActiveDraftName("Draft A");
    setActiveDraftName(null);
    expect(getActiveDraftName()).toBeNull();
  });
});

describe("saveDraft", () => {
  it("saves a new draft", () => {
    const result = saveDraft("New", { rows: [], groupTitle: "T", savedDate: "2026-01-01" });
    expect(result["New"]).toBeDefined();
    expect(loadAllDrafts()["New"]).toBeDefined();
  });

  it("creates multiple drafts", () => {
    saveDraft("A", { rows: [], groupTitle: "A", savedDate: "2026-01-01" });
    saveDraft("B", { rows: [], groupTitle: "B", savedDate: "2026-01-02" });
    const all = loadAllDrafts();
    expect(Object.keys(all)).toHaveLength(2);
  });
});

describe("deleteDraft", () => {
  it("removes a draft", () => {
    saveDraft("ToDelete", { rows: [], groupTitle: "X", savedDate: "2026-01-01" });
    deleteDraft("ToDelete");
    expect(loadAllDrafts()["ToDelete"]).toBeUndefined();
  });

  it("does not affect other drafts", () => {
    saveDraft("Keep", { rows: [], groupTitle: "K", savedDate: "2026-01-01" });
    saveDraft("Remove", { rows: [], groupTitle: "R", savedDate: "2026-01-02" });
    deleteDraft("Remove");
    expect(loadAllDrafts()["Keep"]).toBeDefined();
  });
});

describe("clearAllDrafts", () => {
  it("removes all drafts and active name", () => {
    saveDraft("D1", { rows: [], groupTitle: "T", savedDate: "2026-01-01" });
    setActiveDraftName("D1");
    clearAllDrafts();
    expect(loadAllDrafts()).toEqual({});
    expect(getActiveDraftName()).toBeNull();
  });
});

/**
 * Draft management for CreatePage.
 * Stores multiple named drafts in localStorage.
 */

export interface DraftData {
  rows: unknown[];
  groupTitle: string;
  savedDate: string;
}

const DRAFTS_KEY = "createPage_drafts";
const ACTIVE_KEY = "createPage_activeDraft";

export function loadAllDrafts(): Record<string, DraftData> {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

export function saveAllDrafts(drafts: Record<string, DraftData>) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

export function getActiveDraftName(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveDraftName(name: string | null) {
  if (name) {
    localStorage.setItem(ACTIVE_KEY, name);
  } else {
    localStorage.removeItem(ACTIVE_KEY);
  }
}

export function saveDraft(name: string, data: DraftData): Record<string, DraftData> {
  const drafts = loadAllDrafts();
  drafts[name] = data;
  saveAllDrafts(drafts);
  return drafts;
}

export function deleteDraft(name: string): Record<string, DraftData> {
  const drafts = loadAllDrafts();
  delete drafts[name];
  saveAllDrafts(drafts);
  return drafts;
}

export function clearAllDrafts() {
  localStorage.removeItem(DRAFTS_KEY);
  localStorage.removeItem(ACTIVE_KEY);
}

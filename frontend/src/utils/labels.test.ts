import { describe, it, expect } from "vitest";
import { TYPE_LABELS, PERIOD_LABELS, SPEAKER_COLORS } from "./labels";

describe("TYPE_LABELS", () => {
  it("has all review result types", () => {
    expect(TYPE_LABELS.forget).toBe("忘記");
    expect(TYPE_LABELS.unsure).toBe("不確定");
    expect(TYPE_LABELS.remember).toBe("記得");
  });

  it("has exactly 3 types", () => {
    expect(Object.keys(TYPE_LABELS)).toHaveLength(3);
  });
});

describe("PERIOD_LABELS", () => {
  it("has all time periods", () => {
    expect(PERIOD_LABELS.today).toBe("本日");
    expect(PERIOD_LABELS.week).toBe("本週");
    expect(PERIOD_LABELS.month).toBe("本月");
    expect(PERIOD_LABELS.quarter).toBe("本季");
    expect(PERIOD_LABELS.all).toBe("全部");
  });

  it("has exactly 5 periods", () => {
    expect(Object.keys(PERIOD_LABELS)).toHaveLength(5);
  });
});

describe("SPEAKER_COLORS", () => {
  it("has colors for A and B speakers", () => {
    expect(SPEAKER_COLORS.A).toBe("blue");
    expect(SPEAKER_COLORS.B).toBe("green");
  });

  it("has at least 4 speaker colors", () => {
    expect(Object.keys(SPEAKER_COLORS).length).toBeGreaterThanOrEqual(4);
  });
});

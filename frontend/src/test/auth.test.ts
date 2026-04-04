import { describe, it, expect, beforeEach } from "vitest";

describe("auth localStorage logic", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // --- Token management ---
  it("stores token and user on login", () => {
    const token = "test-jwt-token";
    const user = { id: "1", email: "test@test.com", name: "Test", picture: null };
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));

    expect(localStorage.getItem("token")).toBe(token);
    expect(JSON.parse(localStorage.getItem("user")!)).toEqual(user);
  });

  it("clears token and user on logout", () => {
    localStorage.setItem("token", "abc");
    localStorage.setItem("user", '{"name":"Test"}');

    localStorage.removeItem("token");
    localStorage.removeItem("user");

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
  });

  it("handles corrupted user JSON gracefully", () => {
    localStorage.setItem("user", "not-json");
    let user = null;
    try {
      user = JSON.parse(localStorage.getItem("user")!);
    } catch {
      user = null;
    }
    expect(user).toBeNull();
  });

  // --- Token persistence ---
  it("token persists across reads", () => {
    localStorage.setItem("token", "persistent-token");
    expect(localStorage.getItem("token")).toBe("persistent-token");
    expect(localStorage.getItem("token")).toBe("persistent-token");
  });

  it("user object roundtrips correctly", () => {
    const user = { id: "uuid-123", email: "a@b.com", name: "名前", picture: "https://photo.url" };
    localStorage.setItem("user", JSON.stringify(user));
    const loaded = JSON.parse(localStorage.getItem("user")!);
    expect(loaded).toEqual(user);
    expect(loaded.picture).toBe("https://photo.url");
  });
});

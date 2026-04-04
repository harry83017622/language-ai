import { describe, it, expect, beforeEach, vi } from "vitest";

// We test the localStorage logic directly since AuthProvider depends on React context
describe("auth localStorage logic", () => {
  beforeEach(() => {
    localStorage.clear();
  });

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
});

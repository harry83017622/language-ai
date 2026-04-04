import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SpeakButton from "../components/SpeakButton";

describe("SpeakButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window.speechSynthesis, "speak");
    vi.spyOn(window.speechSynthesis, "cancel");
  });

  it("renders a button", () => {
    render(<SpeakButton text="hello" />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls speechSynthesis on click", async () => {
    render(<SpeakButton text="hello" />);
    await userEvent.click(screen.getByRole("button"));
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
  });

  it("does not call speak when text is empty", async () => {
    render(<SpeakButton text="" />);
    await userEvent.click(screen.getByRole("button"));
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
  });
});

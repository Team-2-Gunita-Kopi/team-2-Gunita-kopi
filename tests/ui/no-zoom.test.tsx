import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoZoom } from "@/ui/NoZoom";

const fire = (target: EventTarget, e: Event) => {
  target.dispatchEvent(e);
  return e.defaultPrevented;
};

describe("NoZoom", () => {
  it("blocks Ctrl/Cmd zoom shortcuts and Safari pinch, leaves normal input alone", () => {
    const { unmount } = render(<NoZoom />);
    const opts = { cancelable: true, bubbles: true };

    expect(fire(window, new WheelEvent("wheel", { ...opts, ctrlKey: true }))).toBe(true);
    expect(fire(window, new WheelEvent("wheel", opts))).toBe(false);
    expect(fire(window, new KeyboardEvent("keydown", { ...opts, ctrlKey: true, key: "=" }))).toBe(true);
    expect(fire(window, new KeyboardEvent("keydown", { ...opts, metaKey: true, key: "-" }))).toBe(true);
    expect(fire(window, new KeyboardEvent("keydown", { ...opts, ctrlKey: true, key: "c" }))).toBe(false);
    expect(fire(document, new Event("gesturestart", opts))).toBe(true);

    unmount();
    expect(fire(window, new WheelEvent("wheel", { ...opts, ctrlKey: true }))).toBe(false);
  });
});

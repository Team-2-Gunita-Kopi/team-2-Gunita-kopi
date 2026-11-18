import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog, OverlayProvider, useConfirm, useToast } from "../src";

function Harness({ sticky }: { sticky?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <Dialog isOpen={open} onClose={() => setOpen(false)} title="Edit" sticky={sticky}>
        <input aria-label="first" />
        <button>last</button>
      </Dialog>
    </>
  );
}

afterEach(() => vi.useRealTimers());

describe("Dialog", () => {
  it("backdrop click and the close button close a normal dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("open"));
    await user.pointer({ keys: "[MouseLeft]", target: document.querySelector(".modal-backdrop") as HTMLElement });
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByText("open"));
    await user.click(screen.getByLabelText("Close dialog"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Esc closes a normal dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("open"));
    expect(screen.getByRole("dialog", { name: "Edit" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Esc and backdrop do not close a sticky dialog", async () => {
    const user = userEvent.setup();
    render(<Harness sticky />);
    await user.click(screen.getByText("open"));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeTruthy();
    const backdrop = document.querySelector(".modal-backdrop") as HTMLElement;
    await user.pointer({ keys: "[MouseLeft]", target: backdrop });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("focuses first focusable, wraps Tab, restores focus on close", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByText("open");
    await user.click(trigger);
    // The close button is first in DOM order (header), so it is the first focusable.
    const first = screen.getByLabelText("Close dialog");
    expect(document.activeElement).toBe(first);
    screen.getByText("last").focus();
    await user.tab();
    expect(document.activeElement).toBe(first);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByText("last"));
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(trigger);
  });
});

function ConfirmHarness({ onResult }: { onResult: (v: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <button
      onClick={async () => onResult(await confirm({ title: "Delete?", message: "Sure?", confirmLabel: "Yes", danger: true }))}
    >
      ask
    </button>
  );
}

describe("useConfirm", () => {
  it("resolves true on confirm and false on cancel / Esc", async () => {
    const user = userEvent.setup();
    const results: boolean[] = [];
    render(
      <OverlayProvider>
        <ConfirmHarness onResult={(v) => results.push(v)} />
      </OverlayProvider>,
    );
    await user.click(screen.getByText("ask"));
    await user.click(screen.getByRole("button", { name: "Yes" }));
    await user.click(screen.getByText("ask"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByText("ask"));
    await user.keyboard("{Escape}");
    expect(results).toEqual([true, false, false]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("throws outside OverlayProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ConfirmHarness onResult={() => {}} />)).toThrow(/OverlayProvider/);
    spy.mockRestore();
  });
});

function ToastHarness() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast("Saved")}>ok</button>
      <button onClick={() => toast("Oops", true)}>bad</button>
    </>
  );
}

describe("useToast", () => {
  it("shows in the live region and dismisses after 3600 ms", () => {
    vi.useFakeTimers();
    render(
      <OverlayProvider>
        <ToastHarness />
      </OverlayProvider>,
    );
    const region = document.querySelector(".toast-region") as HTMLElement;
    expect(region.getAttribute("aria-live")).toBe("polite");
    act(() => screen.getByText("ok").click());
    act(() => screen.getByText("bad").click());
    expect(region.textContent).toContain("Saved");
    expect(region.querySelectorAll(".toast.err").length).toBe(1);
    act(() => void vi.advanceTimersByTime(3599));
    expect(region.textContent).toContain("Saved");
    act(() => void vi.advanceTimersByTime(1));
    expect(region.textContent).toBe("");
  });
});

function StackHarness({ onResult }: { onResult: (v: boolean) => void }) {
  const [open, setOpen] = useState(true);
  const confirm = useConfirm();
  return (
    <Dialog isOpen={open} onClose={() => setOpen(false)} title="Edit">
      <button onClick={async () => onResult(await confirm({ title: "Sure?", message: "m" }))}>ask</button>
    </Dialog>
  );
}

describe("stacked dialogs", () => {
  it("only the topmost dialog handles Esc and Tab", async () => {
    const user = userEvent.setup();
    const results: boolean[] = [];
    render(
      <OverlayProvider>
        <StackHarness onResult={(v) => results.push(v)} />
      </OverlayProvider>,
    );
    await user.click(screen.getByText("ask"));
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    const top = screen.getByRole("dialog", { name: "Sure?" });
    await user.tab();
    await user.tab();
    await user.tab();
    expect(top.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    expect(results).toEqual([false]);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Edit" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a second confirm cancels the pending one", async () => {
    function Two({ onResult }: { onResult: (v: boolean) => void }) {
      const confirm = useConfirm();
      return <button onClick={() => void confirm({ title: "t", message: "m" }).then(onResult)}>go</button>;
    }
    const user = userEvent.setup();
    const results: boolean[] = [];
    render(
      <OverlayProvider>
        <Two onResult={(v) => results.push(v)} />
      </OverlayProvider>,
    );
    act(() => screen.getByText("go").click());
    act(() => screen.getByText("go").click());
    await vi.waitFor(() => expect(results).toEqual([false]));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(results).toEqual([false, true]));
  });
});

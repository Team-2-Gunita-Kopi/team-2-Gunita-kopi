import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell, CreateAccountForm, ForgotPasswordForm, IdleLogout, LoginForm, Restricted, type NavItem } from "../src";

const NAV: NavItem[] = [
  { label: "Dashboard", short: "Home", href: "/dashboard", icon: "home" },
  { label: "Orders", short: "Orders", href: "/orders", icon: "receipt" },
  { label: "Products", short: "Menu", href: "/products", icon: "cup" },
  { label: "Inventory", short: "Stock", href: "/inventory", icon: "box" },
  { label: "Reports", short: "Reports", href: "/reports", icon: "chart" },
];
const TOP = { title: "Orders", userName: "Ana", roleLabel: "Owner", onLogout: () => {} };

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  document.body.className = "";
});

describe("AppShell", () => {
  it("marks the active nav item (prefix match) with aria-current", () => {
    render(
      <AppShell navItems={NAV} currentPath="/orders/123" topBarProps={TOP}>
        <p>content</p>
      </AppShell>,
    );
    const side = screen.getByRole("navigation", { name: "Main navigation" });
    const links = Array.from(side.querySelectorAll("a"));
    expect(links.filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.getAttribute("href"))).toEqual([
      "/orders",
    ]);
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("collapse toggle sets body.sidebar-collapsed and persists 1", async () => {
    const user = userEvent.setup();
    render(
      <AppShell navItems={NAV} currentPath="/orders" topBarProps={TOP}>
        x
      </AppShell>,
    );
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(true);
    expect(localStorage.getItem("gk-sidebar-collapsed")).toBe("1");
    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(false);
  });

  it("restores the collapsed state from storage", () => {
    localStorage.setItem("gk-sidebar-collapsed", "1");
    render(
      <AppShell navItems={NAV} currentPath="/orders" topBarProps={TOP}>
        x
      </AppShell>,
    );
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(true);
  });

  it("onNavigate is called instead of following the link", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <AppShell navItems={NAV} currentPath="/orders" onNavigate={onNavigate} topBarProps={TOP}>
        x
      </AppShell>,
    );
    await user.click(screen.getByRole("navigation", { name: "Main navigation" }).querySelectorAll("a")[2]!);
    expect(onNavigate).toHaveBeenCalledWith("/products");
  });

  it("bottom nav shows the first N items and a More sheet with the rest and Log out", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(
      <AppShell navItems={NAV} currentPath="/orders" topBarProps={{ ...TOP, onLogout }}>
        x
      </AppShell>,
    );
    const bottom = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(bottom.querySelectorAll("a")).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "More" }));
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(dialog.querySelector('a[href="/reports"]')).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Log out" }));
    expect(onLogout).toHaveBeenCalled();
  });

  it("top bar shows the title, user and logs out", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(
      <AppShell navItems={NAV} topBarProps={{ ...TOP, onLogout }}>
        x
      </AppShell>,
    );
    expect(screen.getByText("Ana")).toBeTruthy();
    await user.click(document.getElementById("tb-logout")!);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

describe("TopBar user menu", () => {
  it("opens on desktop, calls onSelect, and closes on Esc / outside click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <AppShell navItems={NAV} topBarProps={{ ...TOP, menuItems: [{ label: "Reset demo data", onSelect }] }}>
        x
      </AppShell>,
    );
    const btn = screen.getByRole("button", { name: "User menu" });
    expect(btn.getAttribute("aria-haspopup")).toBe("menu");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    await user.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menu")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(btn);
    await user.click(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(btn);
    await user.click(screen.getByRole("menuitem", { name: "Reset demo data" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("More sheet marks the active link with aria-current", async () => {
    const user = userEvent.setup();
    render(
      <AppShell navItems={NAV} currentPath="/reports" topBarProps={TOP}>
        x
      </AppShell>,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    const link = screen.getByRole("dialog", { name: "Menu" }).querySelector('a[href="/reports"]');
    expect(link?.getAttribute("aria-current")).toBe("page");
  });
});

describe("Restricted", () => {
  it("renders the heading and runs the action", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Restricted message="Owner only." actionLabel="Go back" onAction={onAction} />);
    expect(screen.getByRole("heading", { name: "Access restricted" })).toBeTruthy();
    expect(screen.getByText("Owner only.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Go back" }));
    expect(onAction).toHaveBeenCalled();
  });
});

describe("IdleLogout", () => {
  beforeEach(() => vi.useFakeTimers());

  it("warns after timeoutMs, counts down and logs out as idle at 0", () => {
    const onLogout = vi.fn();
    render(<IdleLogout timeoutMs={60000} onLogout={onLogout} warning={<p>2 pending orders</p>} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => void vi.advanceTimersByTime(59999));
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByRole("dialog", { name: "Still there?" })).toBeTruthy();
    expect(screen.getByText(/signed out in/).textContent).toBe("You'll be signed out in 30 s.");
    expect(screen.getByText("2 pending orders")).toBeTruthy();
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.getByText(/signed out in/).textContent).toBe("You'll be signed out in 25 s.");
    act(() => void vi.advanceTimersByTime(25000));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledWith("idle");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("activity before the warning resets the idle timer", () => {
    render(<IdleLogout timeoutMs={1000} onLogout={vi.fn()} />);
    act(() => void vi.advanceTimersByTime(900));
    fireEvent.keyDown(document, { key: "a" });
    act(() => void vi.advanceTimersByTime(900));
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => void vi.advanceTimersByTime(100));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("activity during the warning does not dismiss it; Stay signed in resets", () => {
    const onLogout = vi.fn();
    render(<IdleLogout timeoutMs={1000} onLogout={onLogout} />);
    act(() => void vi.advanceTimersByTime(1000));
    fireEvent.mouseMove(document);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stay signed in" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => void vi.advanceTimersByTime(999));
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("signs out when the clock jumps past the deadline (throttled tab)", () => {
    const onLogout = vi.fn();
    render(<IdleLogout timeoutMs={1000} onLogout={onLogout} />);
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByRole("dialog")).toBeTruthy();
    vi.setSystemTime(Date.now() + 60000);
    act(() => void vi.advanceTimersByTime(1000));
    expect(onLogout).toHaveBeenCalledWith("idle");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Sign out now logs out manually", () => {
    const onLogout = vi.fn();
    render(<IdleLogout timeoutMs={1000} onLogout={onLogout} />);
    act(() => void vi.advanceTimersByTime(1000));
    fireEvent.click(screen.getByRole("button", { name: "Sign out now" }));
    expect(onLogout).toHaveBeenCalledWith("manual");
  });
});

describe("LoginForm", () => {
  function fill(user: ReturnType<typeof userEvent.setup>) {
    return user.type(screen.getByLabelText("Email or username"), "ana").then(() => user.type(screen.getByLabelText("Password"), "pw"));
  }

  it("shows the returned error in an alert", async () => {
    const user = userEvent.setup();
    render(<LoginForm roleLabel="Owner" onSubmit={async () => "Incorrect username or password."} />);
    expect(screen.getByText("Owner Sign-in")).toBeTruthy();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Incorrect username or password.");
  });

  it("eye toggle switches the password input type and label", async () => {
    const user = userEvent.setup();
    render(<LoginForm roleLabel="Barista" onSubmit={async () => null} />);
    const pw = screen.getByLabelText("Password") as HTMLInputElement;
    expect(pw.type).toBe("password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(pw.type).toBe("text");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(pw.type).toBe("password");
  });

  it("passes trimmed identifier and disables the button while loading", async () => {
    const user = userEvent.setup();
    let resolve!: (v: string | null) => void;
    const onSubmit = vi.fn(() => new Promise<string | null>((r) => (resolve = r)));
    render(<LoginForm roleLabel="Owner" onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("Email or username"), "  ana ");
    await user.type(screen.getByLabelText("Password"), "pw");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onSubmit).toHaveBeenCalledWith("ana", "pw");
    expect((screen.getByRole("button", { name: "Signing in…" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resolve(null));
    expect((screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("locks for 30 s after 5 failures, then allows another attempt", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSubmit = vi.fn(async () => "Incorrect username or password.");
    render(<LoginForm roleLabel="Owner" onSubmit={onSubmit} />);
    await fill(user);
    const btn = screen.getByRole("button", { name: "Sign in" });
    for (let i = 0; i < 5; i++) await user.click(btn);
    expect(onSubmit).toHaveBeenCalledTimes(5);
    expect(screen.getByRole("alert").textContent).toBe("Too many attempts — locked for 30 s.");

    await user.click(btn);
    expect(onSubmit).toHaveBeenCalledTimes(5);
    expect(screen.getByRole("alert").textContent).toMatch(/^Too many attempts — try again in \d+ s\.$/);

    act(() => void vi.advanceTimersByTime(30001));
    await user.click(btn);
    expect(onSubmit).toHaveBeenCalledTimes(6);
    expect(screen.getByRole("alert").textContent).toBe("Incorrect username or password.");
  });
});

describe("LoginForm links", () => {
  it("hides the links unless handlers are given", () => {
    render(<LoginForm roleLabel="Barista" onSubmit={async () => null} />);
    expect(screen.queryByRole("button", { name: "Forgot password?" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  });

  it("calls the forgot-password and create-account handlers and shows a notice", async () => {
    const user = userEvent.setup();
    const onForgot = vi.fn();
    const onCreate = vi.fn();
    render(
      <LoginForm roleLabel="Owner" onSubmit={async () => null} onForgotPassword={onForgot} onCreateAccount={onCreate} notice="Password updated." />,
    );
    expect(screen.getByRole("status").textContent).toBe("Password updated.");
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(onForgot).toHaveBeenCalledOnce();
    expect(onCreate).toHaveBeenCalledOnce();
  });
});

describe("ForgotPasswordForm", () => {
  it("walks email -> code -> new password", async () => {
    const user = userEvent.setup();
    const onRequestCode = vi.fn(async () => {});
    const onVerifyCode = vi.fn(async () => {});
    const onResetPassword = vi.fn(async () => {});
    const onDone = vi.fn();
    render(
      <ForgotPasswordForm
        roleLabel="Owner"
        onRequestCode={onRequestCode}
        onVerifyCode={onVerifyCode}
        onResetPassword={onResetPassword}
        onDone={onDone}
        onBack={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Send recovery link" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter a valid email address.");
    await user.type(screen.getByLabelText("Email address"), " mark@gmail.com ");
    await user.click(screen.getByRole("button", { name: "Send recovery link" }));
    expect(onRequestCode).toHaveBeenCalledWith("mark@gmail.com");

    expect(await screen.findByText("mark@gmail.com")).toBeTruthy();
    await user.type(screen.getByLabelText("Recovery code"), "123456");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onVerifyCode).toHaveBeenCalledWith("mark@gmail.com", "123456");

    await user.type(await screen.findByLabelText("New password (min 8 chars)"), "newpass123");
    await user.type(screen.getByLabelText("Confirm password"), "different1");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(screen.getByRole("alert").textContent).toBe("Passwords do not match.");
    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), "newpass123");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(onResetPassword).toHaveBeenCalledWith("mark@gmail.com", "123456", "newpass123");
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("shows the error from a rejected code", async () => {
    const user = userEvent.setup();
    render(
      <ForgotPasswordForm
        roleLabel="Owner"
        onRequestCode={async () => {}}
        onVerifyCode={async () => {
          throw new Error("That recovery code is invalid or has expired.");
        }}
        onResetPassword={async () => {}}
        onDone={() => {}}
        onBack={() => {}}
      />,
    );
    await user.type(screen.getByLabelText("Email address"), "a@b.co");
    await user.click(screen.getByRole("button", { name: "Send recovery link" }));
    await user.type(await screen.findByLabelText("Recovery code"), "999999");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toBe("That recovery code is invalid or has expired.");
  });
});

describe("CreateAccountForm", () => {
  it("validates, submits trimmed values and reports server errors", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => {
      throw new Error("Registration is closed. Ask the Owner to create your account.");
    });
    const onBack = vi.fn();
    render(<CreateAccountForm onCreate={onCreate} onDone={() => {}} onBack={onBack} />);
    await user.type(screen.getByLabelText("Full name"), " Mark Allen ");
    await user.type(screen.getByLabelText("Email address"), "mark@gmail.com");
    await user.type(screen.getByLabelText("Username"), "mark");
    await user.type(screen.getByLabelText("Password (min 8 chars)"), "secret12");
    await user.type(screen.getByLabelText("Confirm password"), "secret12");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(onCreate).toHaveBeenCalledWith({ fullName: "Mark Allen", email: "mark@gmail.com", username: "mark", password: "secret12" });
    expect((await screen.findByRole("alert")).textContent).toBe("Registration is closed. Ask the Owner to create your account.");
    await user.click(screen.getByRole("button", { name: "← Back to sign in" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("requires the setup code in one-time registration and returns the success message", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => "Owner account created.");
    const onDone = vi.fn();
    render(
      <CreateAccountForm
        onCreate={onCreate}
        onDone={onDone}
        onBack={() => {}}
        requiresSetupCode
      />,
    );
    await user.type(screen.getByLabelText("Full name"), "Owner Name");
    await user.type(screen.getByLabelText("Email address"), "owner@example.com");
    await user.type(screen.getByLabelText("Username"), "owner");
    await user.type(screen.getByLabelText("Password (min 8 chars)"), "password123");
    await user.type(screen.getByLabelText("Confirm password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Setup code is required.");
    expect(onCreate).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Setup code"), "secret-code");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(onCreate).toHaveBeenCalledWith({
      fullName: "Owner Name",
      email: "owner@example.com",
      username: "owner",
      password: "password123",
      setupCode: "secret-code",
    });
    expect(onDone).toHaveBeenCalledWith("Owner account created.");
  });
});

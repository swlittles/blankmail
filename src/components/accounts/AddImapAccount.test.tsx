import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  loadAccountDraft: vi.fn(),
  saveAccountDraft: vi.fn(),
  clearAccountDraft: vi.fn(),
  lookupAutoconfig: vi.fn(),
  insertImapAccount: vi.fn(),
  addAccount: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@/services/imap/accountDraft", () => ({
  loadAccountDraft: mocks.loadAccountDraft,
  saveAccountDraft: mocks.saveAccountDraft,
  clearAccountDraft: mocks.clearAccountDraft,
}));
vi.mock("@/services/imap/autoconfig", () => ({ lookupAutoconfig: mocks.lookupAutoconfig }));
vi.mock("@/services/db/accounts", () => ({
  insertImapAccount: mocks.insertImapAccount,
  insertOAuthImapAccount: vi.fn(),
}));
vi.mock("@/stores/accountStore", () => ({
  useAccountStore: (sel: (s: { addAccount: typeof mocks.addAccount }) => unknown) => sel({ addAccount: mocks.addAccount }),
}));
vi.mock("@/services/oauth/oauthFlow", () => ({ startProviderOAuthFlow: vi.fn() }));

import { AddImapAccount } from "./AddImapAccount";

const MANGO = {
  imapHost: "imap.mymangomail.com",
  imapPort: 993,
  imapSecurity: "ssl" as const,
  smtpHost: "smtp.mymangomail.com",
  smtpPort: 465,
  smtpSecurity: "ssl" as const,
};

function renderWizard() {
  const onSuccess = vi.fn();
  render(<AddImapAccount onClose={vi.fn()} onSuccess={onSuccess} onBack={vi.fn()} />);
  return { onSuccess };
}

const stepButton = (name: string) => screen.getByRole("button", { name: new RegExp(name) });

describe("AddImapAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadAccountDraft.mockResolvedValue(null);
    mocks.saveAccountDraft.mockResolvedValue(undefined);
    mocks.clearAccountDraft.mockResolvedValue(undefined);
    mocks.lookupAutoconfig.mockResolvedValue(null);
    mocks.insertImapAccount.mockResolvedValue(undefined);
  });

  it("fills server settings from the domain's autoconfig", async () => {
    mocks.lookupAutoconfig.mockResolvedValue({ settings: MANGO, source: "autoconfig.blankman.tv" });
    renderWizard();
    const email = await screen.findByPlaceholderText("you@example.com");
    fireEvent.change(email, { target: { value: "me@blankman.tv" } });
    fireEvent.blur(email);

    expect(await screen.findByText(/Found server settings \(autoconfig\.blankman\.tv\)/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/email password/), { target: { value: "pw" } });
    fireEvent.click(stepButton("Outgoing"));
    expect(screen.getByDisplayValue("smtp.mymangomail.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("465")).toBeInTheDocument();
  });

  it("warns when it has to guess the servers", async () => {
    renderWizard();
    const email = await screen.findByPlaceholderText("you@example.com");
    fireEvent.change(email, { target: { value: "me@unknown-domain.tv" } });
    fireEvent.blur(email);
    expect(await screen.findByText(/Couldn.t find published settings/)).toBeInTheDocument();
  });

  it("only allows jumping to steps whose earlier steps are filled in", async () => {
    renderWizard();
    await screen.findByPlaceholderText("you@example.com");
    expect(stepButton("Incoming")).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "me@x.io" } });
    fireEvent.change(screen.getByPlaceholderText(/email password/), { target: { value: "pw" } });
    expect(stepButton("Incoming")).toBeEnabled();
    expect(stepButton("Outgoing")).toBeDisabled(); // IMAP host still empty

    fireEvent.click(stepButton("Incoming"));
    fireEvent.change(screen.getByPlaceholderText("imap.example.com"), { target: { value: "imap.x.io" } });
    fireEvent.click(stepButton("Outgoing"));
    expect(screen.getByPlaceholderText("smtp.example.com")).toBeInTheDocument();

    fireEvent.click(stepButton("Account"));
    expect(screen.getByDisplayValue("me@x.io")).toBeInTheDocument();
  });

  it("restores a saved draft and can start over", async () => {
    mocks.loadAccountDraft.mockResolvedValue({
      form: { email: "me@blankman.tv", password: "pw", ...MANGO },
      step: "smtp",
      discovery: { status: "done", domain: "blankman.tv", source: "autoconfig", detail: "autoconfig.blankman.tv" },
      autoFilled: null,
      detectedAuthMethods: ["password"],
      detectedOAuthProviderId: null,
    });
    renderWizard();
    expect(await screen.findByDisplayValue("smtp.mymangomail.com")).toBeInTheDocument();
    expect(screen.getByText(/Restored what you entered/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Start over"));
    expect(mocks.clearAccountDraft).toHaveBeenCalled();
    expect(screen.getByPlaceholderText("you@example.com")).toHaveValue("");
  });

  it("saves progress as the user types", async () => {
    renderWizard();
    const email = await screen.findByPlaceholderText("you@example.com");
    fireEvent.change(email, { target: { value: "me@x.io" } });
    await waitFor(() =>
      expect(mocks.saveAccountDraft).toHaveBeenCalledWith(
        expect.objectContaining({ step: "basic", form: expect.objectContaining({ email: "me@x.io" }) }),
      ),
    );
  });

  it("clears the draft and stores a separate SMTP password when the account is added", async () => {
    mocks.loadAccountDraft.mockResolvedValue({
      form: { email: "me@blankman.tv", password: "imap-pw", samePassword: false, smtpPassword: "smtp-pw", ...MANGO },
      step: "test",
      discovery: { status: "idle" },
      autoFilled: null,
      detectedAuthMethods: ["password"],
      detectedOAuthProviderId: null,
    });
    mocks.invoke.mockImplementation(async (cmd: string) =>
      cmd === "smtp_test_connection" ? { success: true, message: "ok" } : "ok",
    );
    const { onSuccess } = renderWizard();
    fireEvent.click(await screen.findByText("Test Connection"));
    const add = screen.getByText("Add Account");
    await waitFor(() => expect(add).toBeEnabled());

    expect(mocks.invoke).toHaveBeenCalledWith(
      "smtp_test_connection",
      expect.objectContaining({ config: expect.objectContaining({ password: "smtp-pw", host: "smtp.mymangomail.com" }) }),
    );

    await act(async () => {
      fireEvent.click(add);
    });
    expect(mocks.insertImapAccount).toHaveBeenCalledWith(
      expect.objectContaining({ password: "imap-pw", smtpPassword: "smtp-pw" }),
    );
    expect(mocks.clearAccountDraft).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });
});

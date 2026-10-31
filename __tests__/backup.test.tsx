import { fireEvent, screen, waitFor } from "expo-router/testing-library";
import { en, enI18n, fixture, renderApp, stored, TODAY } from "./helpers/app";
import { setSyncStatus } from "@/features/sync/status";
import { backupNow, cachedBackups, listBackups, readBackup, shareBackup } from "@/features/backup/files";
import { SEALED_PREFIX, sealBackup } from "@/features/backup/crypto";
import { exportBackup, pickBackup } from "@/features/finance/device";

jest.mock("expo-crypto", () => require("./helpers/aes-mock").aesMock());
jest.mock("expo-secure-store", () => require("./helpers/aes-mock").secureStoreMock());
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

// In-memory stand-in for the expo-file-system File/Directory API (SDK 58).
jest.mock("expo-file-system", () => {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const join = (parts: unknown[]) =>
    parts
      .map((p) => (typeof p === "string" ? p : (p as { uri: string }).uri))
      .reduce((a, b) => `${a.replace(/\/+$/, "")}/${b.replace(/^\/+/, "")}`);
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf("/") + 1);
    }
    get extension() {
      const dot = this.name.lastIndexOf(".");
      return dot > 0 ? this.name.slice(dot) : "";
    }
    get exists() {
      return files.has(this.uri);
    }
    get size() {
      return files.get(this.uri)?.length ?? 0;
    }
    async write(content: string) {
      files.set(this.uri, content);
    }
    async text() {
      const content = files.get(this.uri);
      if (content === undefined) throw new Error("Missing file");
      return content;
    }
    delete() {
      files.delete(this.uri);
    }
    async copy(to: File) {
      files.set(to.uri, await this.text());
    }
    async move(to: File) {
      files.set(to.uri, await this.text());
      files.delete(this.uri);
      this.uri = to.uri;
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return dirs.has(this.uri);
    }
    create() {
      dirs.add(this.uri);
    }
    list() {
      return [...files.keys()]
        .filter((uri) => uri.startsWith(`${this.uri}/`) && !uri.slice(this.uri.length + 1).includes("/"))
        .map((uri) => new File(uri));
    }
  }
  return {
    File,
    Directory,
    Paths: { document: new Directory("file:///docs"), cache: new Directory("file:///cache") },
    __files: files,
    __dirs: dirs,
  };
});
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));

const fs = jest.requireMock("expo-file-system") as {
  __files: Map<string, string>;
  __dirs: Set<string>;
};
const sharing = jest.requireMock("expo-sharing") as { shareAsync: jest.Mock };
// What each share received, read while the share sheet is "open".
let sharedContent: (string | undefined)[] = [];
const FOLDER = "file:///docs/Backups/ui-test-user";
const todayFile = `${FOLDER}/jav-budget-${TODAY}.json`;

beforeEach(() => {
  fs.__files.clear();
  fs.__dirs.clear();
  sharing.shareAsync.mockClear();
  sharedContent = [];
  sharing.shareAsync.mockImplementation(async (uri: string) => {
    sharedContent.push(fs.__files.get(uri));
  });
});

test("another account cannot list, restore, or share the previous owner's backups", async () => {
  await backupNow(fixture());
  const previous = listBackups()[0];
  expect(previous).toBeDefined();
  expect(cachedBackups(100).list).toHaveLength(1);
  setSyncStatus({ user: { id: "other-user", email: "other@example.test" }, ledgerUserId: "other-user" });
  expect(cachedBackups(100).list).toEqual([]);
  expect(listBackups()).toEqual([]);
  await expect(readBackup(previous)).rejects.toThrow();
  await expect(shareBackup(previous)).rejects.toThrow();
  expect(sharing.shareAsync).not.toHaveBeenCalled();
  setSyncStatus({ user: null, ledgerUserId: null });
  expect(cachedBackups(100).list).toEqual([]);
  expect(() => listBackups()).toThrow();
});

test("Back up now writes today's restorable backup and Share opens it", async () => {
  const { user } = await renderApp("/settings");
  expect(await screen.findByText(en("backup.auto"))).toBeOnTheScreen();

  await user.press(screen.getByRole("button", { name: en("backup.now") }));
  expect(await screen.findByText(en("backup.done"))).toBeOnTheScreen();

  // Encrypted at rest: no ledger text in the file, but it restores to the ledger.
  const written = fs.__files.get(todayFile);
  expect(written?.startsWith(SEALED_PREFIX)).toBe(true);
  expect(written).not.toContain("Main checking");
  expect(JSON.parse(await readBackup(listBackups()[0]))).toEqual(await stored());
  expect(
    screen.getByText(en("backup.last", { date: enI18n.mediumDate(TODAY), count: 1 })),
  ).toBeOnTheScreen();

  await user.press(
    screen.getByRole("button", {
      name: `${en("backup.share")}, ${enI18n.mediumDate(TODAY)}`,
    }),
  );
  // Shares a plain JSON copy from the cache and removes it afterwards.
  const shared = `file:///cache/jav-budget-${TODAY}.json`;
  await waitFor(() =>
    expect(sharing.shareAsync).toHaveBeenCalledWith(shared, expect.objectContaining({ mimeType: "application/json" })),
  );
  expect(sharedContent[0]).toEqual(JSON.stringify(await stored(), null, 2));
  await waitFor(() => expect(fs.__files.has(shared)).toBe(false));
  expect(fs.__files.get(todayFile)).toBe(written);
});

test("a sealed backup only opens for its owner and fails closed when tampered with", async () => {
  const state = fixture();
  const sealed = await sealBackup(JSON.stringify(state, null, 2), "other-user");
  fs.__dirs.add(FOLDER);
  fs.__files.set(`${FOLDER}/jav-budget-2026-01-15.json`, sealed);
  const [entry] = listBackups();
  await expect(readBackup(entry)).rejects.toThrow(en("backup.missing"));
  fs.__files.set(entry.uri, await sealBackup(JSON.stringify(state, null, 2), "ui-test-user"));
  expect(JSON.parse(await readBackup(entry))).toEqual(state);
  // The key lives in the keychain (SecureStore), and tampering fails authentication.
  const store = jest.requireMock("expo-secure-store") as { __items: Map<string, string> };
  const key = [...store.__items.entries()].find(([name]) => name.startsWith("jav-budget.backup-key"));
  expect(key).toBeDefined();
  const tampered = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
  fs.__files.set(entry.uri, tampered);
  await expect(readBackup(entry)).rejects.toThrow(en("backup.missing"));
});

test("manual export removes its plain cache copy after sharing", async () => {
  await exportBackup('{"version":2}');
  const [[uri]] = sharing.shareAsync.mock.calls;
  expect(uri).toMatch(/^file:\/\/\/cache\/jav-budget-.*\.json$/);
  expect(sharedContent).toEqual(['{"version":2}']);
  expect(fs.__files.has(uri)).toBe(false);
});

test("picked backups are size-checked before they are read", async () => {
  const picker = jest.requireMock("expo-document-picker") as { getDocumentAsync: jest.Mock };
  const uri = "file:///cache/picked.json";
  fs.__files.set(uri, "x".repeat(10_000_001));
  // The picker may not report a size: the file's own size is checked.
  picker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri, name: "picked.json" }] });
  await expect(pickBackup()).rejects.toThrow(en("device.backupTooLarge"));
  fs.__files.set(uri, "{}");
  await expect(pickBackup()).resolves.toBe("{}");
});

test("restoring a saved backup replaces the data after confirmation", async () => {
  const backupState = fixture({ goals: [{ id: "g1", name: "Trip", currency: "DOP", target: 100_000, saved: 0 }] });
  fs.__dirs.add(FOLDER);
  fs.__files.set(`${FOLDER}/jav-budget-2026-01-15.json`, JSON.stringify(backupState, null, 2));
  // Not a backup name: never listed.
  fs.__files.set(`${FOLDER}/notes.json`, "{}");
  const { user } = await renderApp("/settings");

  await user.press(
    // The automatic backup may already have added today's file.
    await screen.findByRole("button", { name: new RegExp(`^${en("backup.restore")}, `) }),
  );
  await user.press(
    await screen.findByRole("button", {
      name: new RegExp(`^${enI18n.mediumDate("2026-01-15")}, \\d+ KB$`),
    }),
  );
  expect(
    await screen.findByText(en("backup.restoreConfirm", { date: enI18n.mediumDate("2026-01-15") })),
  ).toBeOnTheScreen();
  await user.type(screen.getByLabelText(en("data.confirmA11y")), en("data.confirmWord"));
  await user.press(screen.getByRole("button", { name: en("data.replace") }));

  expect(await screen.findByText(en("data.replaced"))).toBeOnTheScreen();
  expect((await stored()).goals).toEqual(backupState.goals);
  expect(fs.__files.has(`${FOLDER}/notes.json`)).toBe(true);
});

test("automatic backups can be turned off", async () => {
  await renderApp("/settings");
  const toggle = await screen.findByRole("switch", { name: en("backup.auto") });
  expect(toggle).toBeChecked();
  await fireEvent(toggle, "valueChange", false);
  await waitFor(async () => expect((await stored()).settings.autoBackup).toBe(false));
  // Let the form action settle (busy -> false) before the test ends.
  await waitFor(() =>
    expect(screen.getByRole("switch", { name: en("backup.auto") })).toBeEnabled(),
  );
  expect(screen.getByRole("switch", { name: en("backup.auto") })).not.toBeChecked();
});

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./PdfViewerPane.jsx", async () => {
  const React = await import("react");

  return {
    default: React.forwardRef(function MockPDFViewer(props, ref) {
      React.useImperativeHandle(ref, () => ({
        container: null,
        registry: Promise.resolve(globalThis.__TEST_REGISTRY__),
      }));

      React.useEffect(() => {
        props.onReady?.(globalThis.__TEST_REGISTRY__);
      }, [props]);

      return <div data-testid="pdf-viewer" />;
    }),
  };
});

import { App } from "./App.jsx";

function resolvedTask(value) {
  return {
    toPromise: () => Promise.resolve(value),
  };
}

function createEventHook() {
  const listeners = new Set();

  return {
    emit(value) {
      for (const listener of listeners) {
        listener(value);
      }
    },
    hook(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function createRegistry() {
  const activeDocumentChanged = createEventHook();
  const documentOpened = createEventHook();
  const selectionChanged = createEventHook();
  const redactionChanged = createEventHook();
  const pendingChanged = createEventHook();

  const selectionState = {
    text: [],
    formatted: [],
  };

  const redactionState = {
    groups: [],
  };

  const openDocumentBuffer = vi.fn(async ({ name }) => {
    activeDocumentChanged.emit({
      previousDocumentId: null,
      currentDocumentId: "doc-1",
    });
    queueMicrotask(() => {
      documentOpened.emit({
        id: "doc-1",
        name,
      });
    });

    return {
      documentId: "doc-1",
      task: {
        toPromise: () => new Promise(() => {}),
      },
    };
  });

  const queueCurrentSelectionAsPending = vi.fn(async () => {
    const items = [
      {
        id: "pending-1",
        page: 0,
        kind: "text",
        text: selectionState.text.join(" "),
        rect: selectionState.formatted[0]?.rect ?? {
          left: 0.1,
          top: 0.1,
          width: 0.2,
          height: 0.1,
        },
        rects: selectionState.formatted.map((item) => item.rect),
        source: "annotation",
        markColor: "#f59e0b",
        redactionColor: "#111827",
      },
    ];

    redactionState.groups = items;
    redactionChanged.emit({
      type: "add",
      documentId: "doc-1",
      items,
    });
    pendingChanged.emit({
      documentId: "doc-1",
      pending: { 0: items },
    });

    return true;
  });

  const removePending = vi.fn((page, id) => {
    redactionState.groups = redactionState.groups.filter((item) => item.page !== page || item.id !== id);
    redactionChanged.emit({
      type: "remove",
      documentId: "doc-1",
      page,
      id,
    });
    pendingChanged.emit({
      documentId: "doc-1",
      pending: {},
    });
  });

  const clearPending = vi.fn(() => {
    redactionState.groups = [];
    redactionChanged.emit({
      type: "clear",
      documentId: "doc-1",
    });
    pendingChanged.emit({
      documentId: "doc-1",
      pending: {},
    });
  });

  const commitAllPending = vi.fn(async () => {
    redactionChanged.emit({
      type: "commit",
      documentId: "doc-1",
      success: true,
    });
    return true;
  });

  const saveAsCopy = vi.fn(async () => new Uint8Array([1, 2, 3]).buffer);

  const registry = {
    getPlugin(id) {
      if (id === "document-manager") {
        return {
          provides: () => ({
            openDocumentBuffer: (options) =>
              resolvedTask(Promise.resolve(openDocumentBuffer(options)).then((result) => result)),
            closeAllDocuments: () => resolvedTask([]),
            onActiveDocumentChanged: activeDocumentChanged.hook,
            onDocumentOpened: documentOpened.hook,
          }),
        };
      }

      if (id === "selection") {
        return {
          provides: () => ({
            forDocument: () => ({
              getFormattedSelection: () => selectionState.formatted,
              getSelectedText: () => resolvedTask(selectionState.text),
            }),
            onSelectionChange: selectionChanged.hook,
          }),
        };
      }

      if (id === "redaction") {
        return {
          provides: () => ({
            forDocument: () => ({
              queueCurrentSelectionAsPending: () =>
                resolvedTask(Promise.resolve(queueCurrentSelectionAsPending()).then((result) => result)),
              removePending,
              clearPending,
              commitAllPending: () =>
                resolvedTask(Promise.resolve(commitAllPending()).then((result) => result)),
            }),
            onRedactionEvent: redactionChanged.hook,
            onPendingChange: pendingChanged.hook,
          }),
        };
      }

      if (id === "export") {
        return {
          provides: () => ({
            forDocument: () => ({
              saveAsCopy: () => resolvedTask(Promise.resolve(saveAsCopy()).then((result) => result)),
            }),
          }),
        };
      }

      return null;
    },
  };

  return {
    registry,
    selectionState,
    selectionChanged,
    spies: {
      openDocumentBuffer,
      queueCurrentSelectionAsPending,
      removePending,
      clearPending,
      commitAllPending,
      saveAsCopy,
    },
  };
}

describe("App", () => {
  beforeEach(() => {
    globalThis.__TEST_REGISTRY__ = null;
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockReturnValue();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("ファイル読み込みから追加、ダウンロードまで進められる", async () => {
    const testRegistry = createRegistry();
    globalThis.__TEST_REGISTRY__ = testRegistry.registry;

    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => {
      expect(screen.getByLabelText("PDFを選択")).toBeEnabled();
    });

    const file = new File([new Uint8Array([37, 80, 68, 70])], "sample.pdf", {
      type: "application/pdf",
    });
    await user.upload(screen.getByLabelText("PDFを選択"), file);

    await waitFor(() => {
      expect(testRegistry.spies.openDocumentBuffer).toHaveBeenCalledTimes(1);
    });

    await screen.findByText("sample.pdf を読み込みました。文字列をドラッグ選択してください。");

    testRegistry.selectionState.text = ["alpha secret"];
    testRegistry.selectionState.formatted = [
      {
        pageIndex: 0,
        rect: { left: 0.1, top: 0.2, width: 0.4, height: 0.1 },
        segmentRects: [{ left: 0.1, top: 0.2, width: 0.4, height: 0.1 }],
      },
    ];
    testRegistry.selectionChanged.emit({
      documentId: "doc-1",
      selection: { start: { page: 0, index: 0 }, end: { page: 0, index: 11 } },
      modeId: "default",
    });

    await screen.findByText("alpha secret");

    const addButton = screen.getByRole("button", { name: "選択範囲を追加" });
    expect(addButton).toBeEnabled();

    await user.click(addButton);

    await screen.findByText("1 範囲");

    const downloadButton = screen.getByRole("button", { name: "削除してダウンロード" });
    expect(downloadButton).toBeEnabled();

    await user.click(downloadButton);

    await waitFor(() => {
      expect(testRegistry.spies.commitAllPending).toHaveBeenCalledTimes(1);
      expect(testRegistry.spies.saveAsCopy).toHaveBeenCalledTimes(1);
    });
  });

  it("ヘッダー右の Licenses ボタンからローカル同梱ライセンス一覧を開ける", async () => {
    const testRegistry = createRegistry();
    globalThis.__TEST_REGISTRY__ = testRegistry.registry;

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Licenses" }));

    const licensesDialog = await screen.findByRole("dialog", { name: "Licenses" });
    expect(licensesDialog).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "PDFium wrapper (MIT)" })).toHaveAttribute(
      "href",
      `${import.meta.env.BASE_URL}licenses/embedpdf/pdfium/LICENSE`
    );
    expect(screen.getByRole("link", { name: "PDFium bundled license" })).toHaveAttribute(
      "href",
      `${import.meta.env.BASE_URL}licenses/embedpdf/pdfium/LICENSE.pdfium`
    );
    expect(screen.getByRole("link", { name: "EmbedPDF React Viewer (MIT)" })).toHaveAttribute(
      "href",
      `${import.meta.env.BASE_URL}licenses/embedpdf/react-pdf-viewer/LICENSE`
    );
    expect(screen.getByRole("link", { name: "EmbedPDF Snippet (MIT)" })).toHaveAttribute(
      "href",
      `${import.meta.env.BASE_URL}licenses/embedpdf/snippet/LICENSE`
    );
    expect(screen.getByRole("link", { name: "EmbedPDF Engines (MIT)" })).toHaveAttribute(
      "href",
      `${import.meta.env.BASE_URL}licenses/embedpdf/engines/LICENSE`
    );
  });

  it("ヘッダー右の 使い方 ボタンからヘルプモーダルを開ける", async () => {
    const testRegistry = createRegistry();
    globalThis.__TEST_REGISTRY__ = testRegistry.registry;

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "使い方" }));

    const helpDialog = await screen.findByRole("dialog", { name: "使い方" });
    expect(helpDialog).toBeInTheDocument();
    expect(within(helpDialog).getByText("PDFを選択")).toBeInTheDocument();
    expect(within(helpDialog).getByText("表示されたPDF上で文字列をドラッグ選択")).toBeInTheDocument();
    expect(within(helpDialog).getByText("サーバー不要で、クライアントだけで動作します。")).toBeInTheDocument();
  });

  it("開いたモーダルは Escape で閉じられる", async () => {
    const testRegistry = createRegistry();
    globalThis.__TEST_REGISTRY__ = testRegistry.registry;

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Licenses" }));
    expect(await screen.findByRole("dialog", { name: "Licenses" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Licenses" })).not.toBeInTheDocument();
    });
  });
});

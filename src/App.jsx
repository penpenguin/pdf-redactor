import { useEffect, useMemo, useRef, useState } from "react";

import { buildRedactedFilename, downloadBuffer } from "./download.js";
import { LazyPdfViewer } from "./LazyPdfViewer.jsx";
import {
  appendGroup,
  clearGroups,
  removeItemsFromGroups,
  toListEntries,
} from "./redaction-groups.js";
import { readFileAsArrayBuffer, resolveTask } from "./task-utils.js";

const PLUGIN_ID = {
  documentManager: "document-manager",
  selection: "selection",
  redaction: "redaction",
  export: "export",
};

const licenseDocuments = [
  {
    label: "PDFium wrapper (MIT)",
    href: "licenses/embedpdf/pdfium/LICENSE",
  },
  {
    label: "PDFium bundled license",
    href: "licenses/embedpdf/pdfium/LICENSE.pdfium",
  },
  {
    label: "EmbedPDF React Viewer (MIT)",
    href: "licenses/embedpdf/react-pdf-viewer/LICENSE",
  },
  {
    label: "EmbedPDF Snippet (MIT)",
    href: "licenses/embedpdf/snippet/LICENSE",
  },
  {
    label: "EmbedPDF Engines (MIT)",
    href: "licenses/embedpdf/engines/LICENSE",
  },
];

const pdfiumWasmUrl = `${import.meta.env.BASE_URL}pdfium.wasm`;

function getCapability(registry, pluginId) {
  return registry?.getPlugin(pluginId)?.provides?.() ?? null;
}

function normalizeSelectionPreview(textParts, formattedSelection) {
  if (!formattedSelection?.length) {
    return null;
  }

  const text = textParts.join(" ").replace(/\s+/g, " ").trim();
  if (!text) {
    return null;
  }

  return {
    text,
    pages: [...new Set(formattedSelection.map((item) => item.pageIndex + 1))].sort((a, b) => a - b),
    count: formattedSelection.length,
  };
}

async function refreshSelectionPreview(registry, documentId, setPendingSelection) {
  if (!registry || !documentId) {
    setPendingSelection(null);
    return;
  }

  const selection = getCapability(registry, PLUGIN_ID.selection);
  const scope = selection?.forDocument(documentId);
  if (!scope) {
    setPendingSelection(null);
    return;
  }

  const formattedSelection = scope.getFormattedSelection();
  if (!formattedSelection.length) {
    setPendingSelection(null);
    return;
  }

  const textParts = (await resolveTask(scope.getSelectedText())) ?? [];
  setPendingSelection(normalizeSelectionPreview(textParts, formattedSelection));
}

export function App() {
  const viewerRef = useRef(null);
  const registryRef = useRef(null);
  const activeDocumentIdRef = useRef(null);
  const currentFilenameRef = useRef("");

  const [status, setStatus] = useState("PDFを読み込んでください。");
  const [registryReady, setRegistryReady] = useState(false);
  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const [currentFilename, setCurrentFilename] = useState("");
  const [pendingSelection, setPendingSelection] = useState(null);
  const [groups, setGroups] = useState([]);
  const [isWorking, setIsWorking] = useState(false);
  const [activeModal, setActiveModal] = useState(null);

  useEffect(() => {
    activeDocumentIdRef.current = activeDocumentId;
  }, [activeDocumentId]);

  useEffect(() => {
    currentFilenameRef.current = currentFilename;
  }, [currentFilename]);

  useEffect(() => {
    const registry = registryRef.current;
    if (!registry) {
      return undefined;
    }

    const documentManager = getCapability(registry, PLUGIN_ID.documentManager);
    const selection = getCapability(registry, PLUGIN_ID.selection);
    const redaction = getCapability(registry, PLUGIN_ID.redaction);

    const unsubs = [];

    if (documentManager?.onActiveDocumentChanged) {
      unsubs.push(
        documentManager.onActiveDocumentChanged(({ currentDocumentId }) => {
          activeDocumentIdRef.current = currentDocumentId;
          setActiveDocumentId(currentDocumentId);
          if (!currentDocumentId) {
            setPendingSelection(null);
            setGroups([]);
          }
        })
      );
    }

    if (documentManager?.onDocumentOpened) {
      unsubs.push(
        documentManager.onDocumentOpened((document) => {
          const openedId = document?.id ?? document?.documentId ?? activeDocumentIdRef.current;
          if (openedId !== activeDocumentIdRef.current) {
            return;
          }

          setIsWorking(false);
          setStatus(
            `${document?.name ?? currentFilenameRef.current} を読み込みました。文字列をドラッグ選択してください。`
          );
        })
      );
    }

    if (documentManager?.onDocumentError) {
      unsubs.push(
        documentManager.onDocumentError((error) => {
          const errorId = error?.documentId ?? activeDocumentIdRef.current;
          if (errorId !== activeDocumentIdRef.current) {
            return;
          }

          setIsWorking(false);
          setStatus(error?.message || "PDF の読み込みに失敗しました。");
        })
      );
    }

    if (selection?.onSelectionChange) {
      unsubs.push(
        selection.onSelectionChange(async ({ documentId }) => {
          if (documentId !== activeDocumentIdRef.current) {
            return;
          }

          await refreshSelectionPreview(registry, documentId, setPendingSelection);
        })
      );
    }

    if (redaction?.onRedactionEvent) {
      unsubs.push(
        redaction.onRedactionEvent((event) => {
          if (event.documentId !== activeDocumentIdRef.current) {
            return;
          }

          if (event.type === "add") {
            setGroups((current) => appendGroup(current, event.items));
            return;
          }

          if (event.type === "remove") {
            setGroups((current) => removeItemsFromGroups(current, [{ page: event.page, id: event.id }]));
            return;
          }

          if (event.type === "clear" || (event.type === "commit" && event.success)) {
            setGroups(clearGroups);
          }
        })
      );
    }

    return () => {
      for (const unsubscribe of unsubs) {
        unsubscribe();
      }
    };
  }, [registryReady]);

  useEffect(() => {
    if (!activeModal) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setActiveModal(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeModal]);

  const listEntries = useMemo(() => toListEntries(groups).slice().reverse(), [groups]);

  const addButtonDisabled = !activeDocumentId || !pendingSelection || isWorking;
  const hasRedactions = groups.length > 0;
  const undoButtonDisabled = !activeDocumentId || !hasRedactions || isWorking;
  const clearButtonDisabled = !activeDocumentId || !hasRedactions || isWorking;
  const downloadButtonDisabled = !activeDocumentId || !hasRedactions || isWorking;
  const isHelpModalOpen = activeModal === "help";
  const isLicensesModalOpen = activeModal === "licenses";

  const modalTitle = isHelpModalOpen ? "使い方" : "Licenses";

  async function handleViewerReady(registry) {
    registryRef.current = registry;
    setRegistryReady(true);
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const registry = registryRef.current;
    const documentManager = getCapability(registry, PLUGIN_ID.documentManager);
    if (!documentManager) {
      setStatus("PDF エンジンの初期化を待っています。");
      return;
    }

    setIsWorking(true);
    setStatus(`${file.name} を読み込んでいます…`);

    try {
      await resolveTask(documentManager.closeAllDocuments?.());

      const buffer = await readFileAsArrayBuffer(file);
      const response = await resolveTask(
        documentManager.openDocumentBuffer({
          buffer,
          name: file.name,
          autoActivate: true,
        })
      );

      setCurrentFilename(file.name);
      setPendingSelection(null);
      setGroups([]);

      if (!response?.documentId) {
        throw new Error("PDF の読み込み開始に失敗しました。");
      }
      event.target.value = "";
    } catch (error) {
      setIsWorking(false);
      setStatus(error instanceof Error ? error.message : "PDF の読み込みに失敗しました。");
      event.target.value = "";
    }
  }

  async function handleAddSelection() {
    const registry = registryRef.current;
    const redaction = getCapability(registry, PLUGIN_ID.redaction);
    const selection = getCapability(registry, PLUGIN_ID.selection);
    const redactionScope = redaction?.forDocument(activeDocumentId);
    const selectionScope = selection?.forDocument(activeDocumentId);
    if (!redactionScope) {
      return;
    }

    setIsWorking(true);

    try {
      const added = await resolveTask(redactionScope.queueCurrentSelectionAsPending());
      if (!added) {
        setStatus("選択範囲を取得できませんでした。");
        return;
      }

      selectionScope?.clear?.();
      setPendingSelection(null);
      setStatus("選択範囲を追加しました。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "選択範囲の追加に失敗しました。");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleUndoLastGroup() {
    const registry = registryRef.current;
    const redaction = getCapability(registry, PLUGIN_ID.redaction);
    const redactionScope = redaction?.forDocument(activeDocumentId);
    const lastGroup = groups.at(-1);
    if (!redactionScope || !lastGroup) {
      return;
    }

    setIsWorking(true);

    try {
      for (const item of lastGroup.items) {
        redactionScope.removePending(item.page, item.id);
      }
      setStatus("最後の追加を取り消しました。");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleClearAll() {
    const registry = registryRef.current;
    const redaction = getCapability(registry, PLUGIN_ID.redaction);
    const redactionScope = redaction?.forDocument(activeDocumentId);
    if (!redactionScope) {
      return;
    }

    setIsWorking(true);

    try {
      redactionScope.clearPending();
      setPendingSelection(null);
      setStatus("削除予定をすべてクリアしました。");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDownload() {
    const registry = registryRef.current;
    const redaction = getCapability(registry, PLUGIN_ID.redaction);
    const exportCapability = getCapability(registry, PLUGIN_ID.export);
    const redactionScope = redaction?.forDocument(activeDocumentId);
    const exportScope = exportCapability?.forDocument(activeDocumentId);
    if (!redactionScope || !exportScope) {
      return;
    }

    setIsWorking(true);
    setStatus("PDF を処理しています…");

    try {
      const committed = await resolveTask(redactionScope.commitAllPending());
      if (!committed) {
        throw new Error("赤線適用に失敗しました。");
      }

      const buffer = await resolveTask(exportScope.saveAsCopy());
      downloadBuffer(buffer, buildRedactedFilename(currentFilename));
      setStatus("削除済み PDF をダウンロードしました。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "PDF の処理に失敗しました。");
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="shell">
      <header className="toolbar">
        <div className="toolbar__left">
          <label className="file-picker">
            <span>PDFを選択</span>
            <input
              aria-label="PDFを選択"
              id="fileInput"
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
              disabled={!registryReady || isWorking}
            />
          </label>
          <button type="button" onClick={handleAddSelection} disabled={addButtonDisabled}>
            選択範囲を追加
          </button>
          <button type="button" onClick={handleUndoLastGroup} disabled={undoButtonDisabled}>
            最後を取り消す
          </button>
          <button type="button" onClick={handleClearAll} disabled={clearButtonDisabled}>
            すべてクリア
          </button>
          <button type="button" className="button--primary" onClick={handleDownload} disabled={downloadButtonDisabled}>
            削除してダウンロード
          </button>
        </div>
        <div className="toolbar__right">
          <button
            type="button"
            className="icon-button"
            aria-label="使い方"
            onClick={() => setActiveModal("help")}
          >
            <span aria-hidden="true">?</span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Licenses"
            onClick={() => setActiveModal("licenses")}
          >
            <span aria-hidden="true">L</span>
          </button>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <section className="panel">
            <h2>現在の選択</h2>
            {pendingSelection ? (
              <div className="selection-preview">
                <div className="meta">
                  <span>ページ: {pendingSelection.pages.join(", ")}</span>
                  <span>{pendingSelection.count} 範囲</span>
                </div>
                <div className="text">{pendingSelection.text}</div>
              </div>
            ) : (
              <div className="empty">まだ選択されていません。</div>
            )}
          </section>

          <section className="panel panel--grow">
            <h2>削除予定一覧</h2>
            {listEntries.length > 0 ? (
              <div className="stack">
                {listEntries.map((entry) => (
                  <article key={entry.groupId} className="redaction-item">
                    <div className="meta">
                      <span>ページ: {entry.pages.join(", ")}</span>
                      <span>{entry.count} 範囲</span>
                    </div>
                    <div className="text">{entry.text || "選択テキストなし"}</div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty">まだ削除範囲はありません。</div>
            )}
          </section>
        </aside>

        <section className="viewer-frame">
          <p className="status status--viewer">{status}</p>
          <LazyPdfViewer
            ref={viewerRef}
            className="viewer"
            style={{ width: "100%", height: "100%" }}
            onReady={handleViewerReady}
            fallback={
              <div className="viewer viewer--loading">
                PDF エンジンを読み込んでいます…
              </div>
            }
            config={{
              tabBar: "never",
              worker: false,
              wasmUrl: pdfiumWasmUrl,
              theme: {
                preference: "light",
                light: {
                  accent: {
                    primary: "#b45309",
                  },
                },
              },
              ui: {
                disabledCategories: [
                  "document",
                  "panel",
                  "tools",
                  "history",
                  "export",
                  "print",
                  "fullscreen",
                  "bookmark",
                  "attachment",
                  "search",
                ],
              },
              redaction: {
                drawBlackBoxes: false,
                useAnnotationMode: false,
              },
              export: {
                defaultFileName: "document-redacted.pdf",
              },
            }}
          />
        </section>
      </main>

      {activeModal ? (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modalTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal__header">
              <h2>{modalTitle}</h2>
              <button
                type="button"
                className="icon-button icon-button--close"
                aria-label={`${modalTitle}を閉じる`}
                onClick={() => setActiveModal(null)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            {isHelpModalOpen ? (
              <div className="modal__body">
                <ol>
                  <li>PDFを選択</li>
                  <li>表示されたPDF上で文字列をドラッグ選択</li>
                  <li>「選択範囲を追加」を押す</li>
                  <li>最後に「削除してダウンロード」</li>
                </ol>
                <p className="note">サーバー不要で、クライアントだけで動作します。</p>
              </div>
            ) : (
              <div className="modal__body">
                <p className="note">
                  同梱している third-party license 原文です。ローカル配布物内のファイルへ直接リンクしています。
                </p>
                <ul className="license-list">
                  {licenseDocuments.map((document) => (
                    <li key={document.href}>
                      <a href={`${import.meta.env.BASE_URL}${document.href}`} target="_blank" rel="noreferrer">
                        {document.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

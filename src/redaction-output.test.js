import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { pathToFileURL } from "node:url";

import { PDFDocument, StandardFonts } from "pdf-lib";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

async function makeSimplePdf(text) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(text, {
    x: 72,
    y: 720,
    size: 32,
    font,
  });

  return Buffer.from(await pdf.save());
}

async function waitForServer(url, timeoutMs = 10_000) {
  const startedAt = Date.now();
  const target = new URL(url);

  while (Date.now() - startedAt < timeoutMs) {
    const connected = await new Promise((resolve) => {
      const socket = net.connect(
        { host: target.hostname, port: Number(target.port) },
        () => {
          socket.end();
          resolve(true);
        }
      );

      socket.on("error", () => resolve(false));
    });

    if (connected) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function extractTextFromPdf(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const standardFontDataUrl = `${pathToFileURL(path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts")).href}/`;
  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    standardFontDataUrl,
  }).promise;

  const parts = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    parts.push(content.items.map((item) => item.str).join(" "));
  }

  return parts.join("\n").replace(/\s+/g, " ").trim();
}

describe("redaction output", () => {
  it("出力 PDF から対象文字列を除去する", async () => {
    const secretText = "alpha secret";
    const inputPdf = await makeSimplePdf(secretText);
    const inputText = await extractTextFromPdf(inputPdf);
    expect(inputText).toContain(secretText);

    const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4174"], {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    try {
      await waitForServer("http://127.0.0.1:4174/");

      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({ acceptDownloads: true });
        const page = await context.newPage();
        await page.goto("http://127.0.0.1:4174/");
        await page.waitForFunction(() => {
          const input = document.querySelector("#fileInput");
          return input instanceof HTMLInputElement && !input.disabled;
        });

        await page.locator("#fileInput").setInputFiles({
          name: "secret.pdf",
          mimeType: "application/pdf",
          buffer: inputPdf,
        });

        await page.waitForFunction(
          () => document.querySelector(".status")?.textContent?.includes("読み込みました"),
          undefined,
          { timeout: 15_000 }
        );

        await page.evaluate(async () => {
          const container = document.querySelector("embedpdf-container");
          const registry = await container.registry;
          const documentManager = registry.getPlugin("document-manager").provides();
          const redaction = registry.getPlugin("redaction").provides();
          const docId = documentManager.getActiveDocumentId();
          const scope = redaction.forDocument(docId);

          scope.clearPending();
          scope.addPending([
            {
              id: "whole-page-redaction",
              page: 0,
              kind: "area",
              rect: {
                origin: { x: 0, y: 0 },
                size: { width: 595, height: 842 },
              },
              source: "annotation",
              markColor: "#f59e0b",
              redactionColor: "#111827",
            },
          ]);
        });

        await expect.poll(async () => page.locator(".redaction-item").count()).toBe(1);

        const [download] = await Promise.all([
          page.waitForEvent("download"),
          page.getByRole("button", { name: "削除してダウンロード" }).click(),
        ]);

        const outputPath = path.join(os.tmpdir(), `redacted-${Date.now()}.pdf`);
        await download.saveAs(outputPath);
        const outputPdf = await fs.readFile(outputPath);
        const outputText = await extractTextFromPdf(outputPdf);

        expect(outputText).not.toContain(secretText);
      } finally {
        await browser.close();
      }
    } finally {
      server.kill("SIGTERM");
    }
  }, 60_000);
});

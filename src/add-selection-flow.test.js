import { spawn } from "node:child_process";
import net from "node:net";

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

describe("add selection flow", () => {
  it("viewer 上で選択した文字列を追加一覧へ反映できる", async () => {
    const inputPdf = await makeSimplePdf("alpha secret beta");
    const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4174"], {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    try {
      await waitForServer("http://127.0.0.1:4174/");

      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        await page.goto("http://127.0.0.1:4174/");
        await page.waitForFunction(() => {
          const input = document.querySelector("#fileInput");
          return input instanceof HTMLInputElement && !input.disabled;
        });

        await page.locator("#fileInput").setInputFiles({
          name: "selection.pdf",
          mimeType: "application/pdf",
          buffer: inputPdf,
        });

        await page.waitForFunction(
          () => document.querySelector(".status")?.textContent?.includes("読み込みました"),
          undefined,
          { timeout: 15_000 }
        );
        await page.waitForTimeout(2_000);

        const pageImageRect = await page.evaluate(() => {
          const image = document.querySelector("embedpdf-container")?.shadowRoot?.querySelector("img");
          const rect = image?.getBoundingClientRect();

          if (!rect) {
            return null;
          }

          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        });

        expect(pageImageRect).toBeTruthy();

        const startX = pageImageRect.x + pageImageRect.width * 0.12;
        const endX = pageImageRect.x + pageImageRect.width * 0.53;
        const y = pageImageRect.y + pageImageRect.height * 0.145;

        await page.mouse.move(startX, y);
        await page.mouse.down();
        await page.mouse.move(endX, y, { steps: 15 });
        await page.mouse.up();

        await expect
          .poll(async () => page.getByRole("button", { name: "選択範囲を追加" }).isDisabled())
          .toBe(false);
        await expect.poll(async () => page.locator(".selection-preview .text").textContent()).toContain(
          "alpha secret beta"
        );

        await page.getByRole("button", { name: "選択範囲を追加" }).click();

        await expect.poll(async () => page.locator(".redaction-item").count()).toBe(1);
        await expect.poll(async () => page.locator(".redaction-item .text").textContent()).toContain(
          "alpha secret beta"
        );
      } finally {
        await browser.close();
      }
    } finally {
      server.kill("SIGTERM");
    }
  }, 60_000);
});

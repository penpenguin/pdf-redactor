import { spawn } from "node:child_process";
import net from "node:net";

import { PDFDocument, StandardFonts } from "pdf-lib";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

async function makeMultiPagePdf(pageCount) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`Page ${index + 1}`, {
      x: 72,
      y: 720,
      size: 32,
      font,
    });

    for (let y = 680; y > 120; y -= 28) {
      page.drawText(`content line ${y}`, {
        x: 72,
        y,
        size: 18,
        font,
      });
    }
  }

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

describe("layout overflow", () => {
  it("大きい PDF を読み込んでもページ全体は縦に伸びず viewer 内でスクロールする", async () => {
    const inputPdf = await makeMultiPagePdf(8);
    const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4174"], {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    try {
      await waitForServer("http://127.0.0.1:4174/");

      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        await page.goto("http://127.0.0.1:4174/");
        await page.waitForFunction(() => {
          const input = document.querySelector("#fileInput");
          return input instanceof HTMLInputElement && !input.disabled;
        });

        await page.locator("#fileInput").setInputFiles({
          name: "large.pdf",
          mimeType: "application/pdf",
          buffer: inputPdf,
        });

        await page.waitForFunction(
          () => document.querySelector(".status")?.textContent?.includes("読み込みました"),
          undefined,
          { timeout: 15_000 }
        );
        await page.waitForTimeout(2_000);

        const metrics = await page.evaluate(() => {
          const viewer = document.querySelector(".viewer");

          return {
            viewportHeight: window.innerHeight,
            documentScrollHeight: document.documentElement.scrollHeight,
            viewerClientHeight: viewer?.clientHeight ?? 0,
          };
        });

        expect(metrics.documentScrollHeight).toBeLessThanOrEqual(metrics.viewportHeight + 4);
        expect(metrics.viewerClientHeight).toBeLessThan(metrics.viewportHeight);
      } finally {
        await browser.close();
      }
    } finally {
      server.kill("SIGTERM");
    }
  }, 60_000);
});

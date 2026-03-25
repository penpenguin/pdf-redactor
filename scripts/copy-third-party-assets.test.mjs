/** @vitest-environment node */

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  copyThirdPartyAssets,
  requiredCopyTargets,
} from "./copy-third-party-assets.mjs";

const tempDirs = [];

async function createTempProject() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "pdf-redactor-license-test-"));
  tempDirs.push(projectRoot);

  return {
    projectRoot,
    distDir: path.join(projectRoot, "dist"),
  };
}

describe("copyThirdPartyAssets", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("コピー対象は license 原文だけを含む", () => {
    expect(requiredCopyTargets).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ destination: "pdfium.wasm" })])
    );
    expect(requiredCopyTargets).toEqual(
      expect.arrayContaining([expect.objectContaining({ destination: "licenses/embedpdf/pdfium/LICENSE" })])
    );

    for (const target of requiredCopyTargets) {
      expect(target.destination).toMatch(/^licenses\//);
    }
  });

  it("必須ファイルを dist 配下へコピーする", async () => {
    const { projectRoot, distDir } = await createTempProject();

    for (const target of requiredCopyTargets) {
      const sourcePath = path.join(projectRoot, target.source);
      await mkdir(path.dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, `fixture:${target.destination}`);
    }

    await copyThirdPartyAssets({ projectRoot, distDir, targets: requiredCopyTargets });

    for (const target of requiredCopyTargets) {
      const destinationPath = path.join(distDir, target.destination);
      await expect(readFile(destinationPath, "utf8")).resolves.toBe(`fixture:${target.destination}`);
    }
  });

  it("コピー元がなければ失敗する", async () => {
    const { projectRoot, distDir } = await createTempProject();

    await expect(
      copyThirdPartyAssets({ projectRoot, distDir, targets: requiredCopyTargets })
    ).rejects.toThrow(/Missing third-party asset/);
  });
});

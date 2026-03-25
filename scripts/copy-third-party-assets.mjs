import { access, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const requiredCopyTargets = [
  {
    source: "node_modules/@embedpdf/pdfium/LICENSE",
    destination: "licenses/embedpdf/pdfium/LICENSE",
  },
  {
    source: "node_modules/@embedpdf/pdfium/LICENSE.pdfium",
    destination: "licenses/embedpdf/pdfium/LICENSE.pdfium",
  },
  {
    source: "node_modules/@embedpdf/react-pdf-viewer/LICENSE",
    destination: "licenses/embedpdf/react-pdf-viewer/LICENSE",
  },
  {
    source: "node_modules/@embedpdf/snippet/LICENSE",
    destination: "licenses/embedpdf/snippet/LICENSE",
  },
  {
    source: "node_modules/@embedpdf/engines/LICENSE",
    destination: "licenses/embedpdf/engines/LICENSE",
  },
];

export async function copyThirdPartyAssets({
  projectRoot,
  distDir = path.join(projectRoot, "dist"),
  targets = requiredCopyTargets,
}) {
  await mkdir(distDir, { recursive: true });

  for (const target of targets) {
    const sourcePath = path.join(projectRoot, target.source);
    const destinationPath = path.join(distDir, target.destination);

    try {
      await access(sourcePath);
    } catch {
      throw new Error(`Missing third-party asset: ${sourcePath}`);
    }

    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
  }
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(scriptDir, "..");

  await copyThirdPartyAssets({ projectRoot });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

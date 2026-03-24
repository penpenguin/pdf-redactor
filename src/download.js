export function buildRedactedFilename(filename) {
  if (!filename) {
    return "document-redacted.pdf";
  }

  if (/\.pdf$/i.test(filename)) {
    return filename.replace(/\.pdf$/i, "-redacted.pdf");
  }

  return `${filename}-redacted.pdf`;
}

export function downloadBuffer(buffer, filename) {
  const blob = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

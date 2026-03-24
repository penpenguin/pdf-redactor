export async function resolveTask(taskOrPromise) {
  if (!taskOrPromise) {
    return null;
  }

  if (typeof taskOrPromise.toPromise === "function") {
    return taskOrPromise.toPromise();
  }

  return taskOrPromise;
}

export function readFileAsArrayBuffer(file) {
  if (typeof file?.arrayBuffer === "function") {
    return file.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("ファイルを読み込めませんでした。"));
    reader.onload = () => resolve(reader.result);
    reader.readAsArrayBuffer(file);
  });
}

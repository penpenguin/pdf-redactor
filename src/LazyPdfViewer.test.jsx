import { render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";

import { LazyPdfViewer } from "./LazyPdfViewer.jsx";

function createDeferred() {
  let resolve;

  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe("LazyPdfViewer", () => {
  it("viewer モジュールの読み込み中はフォールバックを表示する", async () => {
    const deferred = createDeferred();

    render(
      <LazyPdfViewer
        loader={() => deferred.promise}
        fallback={<div>PDF エンジンを読み込んでいます…</div>}
        className="viewer"
      />
    );

    expect(screen.getByText("PDF エンジンを読み込んでいます…")).toBeInTheDocument();

    await act(async () => {
      deferred.resolve({
        default: function MockViewer() {
          return <div data-testid="pdf-viewer" />;
        },
      });
    });

    expect(await screen.findByTestId("pdf-viewer")).toBeInTheDocument();
  });
});

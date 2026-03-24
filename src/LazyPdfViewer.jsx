import { Suspense, lazy, useMemo } from "react";

const DefaultPdfViewerPane = lazy(() => import("./PdfViewerPane.jsx"));

export function LazyPdfViewer({ fallback = null, loader, ...props }) {
  const ViewerPane = useMemo(() => {
    if (!loader) {
      return DefaultPdfViewerPane;
    }

    return lazy(loader);
  }, [loader]);

  return (
    <Suspense fallback={fallback}>
      <ViewerPane {...props} />
    </Suspense>
  );
}

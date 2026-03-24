import { forwardRef } from "react";
import { PDFViewer } from "@embedpdf/react-pdf-viewer";

const PdfViewerPane = forwardRef(function PdfViewerPane(props, ref) {
  return <PDFViewer ref={ref} {...props} />;
});

export default PdfViewerPane;

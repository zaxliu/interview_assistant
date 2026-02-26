import React, { useEffect, useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Set up worker
const pdfjsVersion = pdfjsLib.version;
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

// Configure CMap for CJK font support
const CMAP_URL = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/cmaps/`;
const STANDARD_FONT_DATA_URL = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/standard_fonts/`;

interface PDFViewerProps {
  pdfData: ArrayBuffer;
  filename?: string;
  onPageSelect?: (text: string) => void;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({
  pdfData,
  filename,
  onPageSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [isLoading, setIsLoading] = useState(true);

  // Load PDF
  useEffect(() => {
    const loadPdf = async () => {
      try {
        setIsLoading(true);
        // Create a copy of the ArrayBuffer since pdfjs consumes it
        const pdfDataCopy = pdfData.slice(0);
        const pdfDoc = await pdfjsLib.getDocument({
          data: pdfDataCopy,
          cMapUrl: CMAP_URL,
          cMapPacked: true,
          standardFontDataUrl: STANDARD_FONT_DATA_URL,
        }).promise;
        setPdf(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        setCurrentPage(1);
      } catch (error) {
        console.error('Failed to load PDF:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPdf();
  }, [pdfData]);

  // Render current page
  useEffect(() => {
    if (!pdf || !containerRef.current) return;

    const renderPage = async () => {
      const page = await pdf.getPage(currentPage);
      const viewport = page.getViewport({ scale });

      // Clear previous content
      containerRef.current!.innerHTML = '';

      // Create wrapper for canvas and text layer
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.style.display = 'inline-block';

      // Create canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      canvas.style.display = 'block';
      canvas.style.margin = '0 auto';

      wrapper.appendChild(canvas);

      // Render page to canvas
      await page.render({
        canvasContext: ctx!,
        viewport,
      }).promise;

      // Get text content and create selectable text layer
      const textContent = await page.getTextContent();

      // Create text layer for selection
      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      textLayerDiv.style.position = 'absolute';
      textLayerDiv.style.left = '0';
      textLayerDiv.style.top = '0';
      textLayerDiv.style.width = '100%';
      textLayerDiv.style.height = '100%';
      textLayerDiv.style.overflow = 'hidden';
      textLayerDiv.style.lineHeight = '1';
      textLayerDiv.style.pointerEvents = 'auto';

      // Render text spans - no manual highlighting, use native search
      interface TextItemLike {
        str: string;
        transform: number[];
        fontName?: string;
      }
      const allItems = textContent.items as TextItemLike[];
      const textItems = allItems.filter(item => item.str && item.str.trim());

      // Render text spans
      textItems.forEach((item) => {
        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);

        const span = document.createElement('span');
        span.textContent = item.str;
        span.style.position = 'absolute';
        span.style.whiteSpace = 'pre';
        span.style.color = 'transparent';
        span.style.left = `${tx[4]}px`;
        span.style.top = `${tx[5] - tx[3]}px`;
        span.style.fontSize = `${Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1])}px`;
        span.style.fontFamily = item.fontName || 'sans-serif';

        textLayerDiv.appendChild(span);
      });

      wrapper.appendChild(textLayerDiv);
      containerRef.current!.appendChild(wrapper);
    };

    renderPage();
  }, [pdf, currentPage, scale]);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handleZoomIn = () => {
    setScale(Math.min(scale + 0.25, 5));
  };

  const handleZoomOut = () => {
    setScale(Math.max(scale - 0.25, 0.5));
  };

  const handleFitWidth = async () => {
    if (!pdf || !containerRef.current) return;
    const page = await pdf.getPage(currentPage);
    const viewport = page.getViewport({ scale: 1 });
    const containerWidth = containerRef.current.clientWidth - 16; // padding
    const newScale = containerWidth / viewport.width;
    setScale(Math.round(newScale * 100) / 100);
  };

  const handleTextSelection = () => {
    if (!onPageSelect) return;

    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      onPageSelect(selection.toString().trim());
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-gray-500">Loading PDF...</div>
      </div>
    );
  }

  if (!pdf) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-red-500">Failed to load PDF</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b bg-gray-50 shrink-0">
        <div className="flex items-center gap-2">
          {filename && (
            <span className="text-xs text-gray-500 truncate max-w-[150px]">{filename}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Page navigation */}
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-xs text-gray-600">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
            className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Zoom */}
          <div className="border-l pl-2 ml-1 flex items-center gap-1">
            <button
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
              title="Zoom Out"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <span className="text-xs text-gray-600 w-10 text-center">{Math.round(scale * 100)}%</span>
            <button
              onClick={handleZoomIn}
              disabled={scale >= 5}
              className="p-1 rounded hover:bg-gray-200 disabled:opacity-50"
              title="Zoom In"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={handleFitWidth}
              className="p-1 rounded hover:bg-gray-200 ml-1"
              title="Fit to Width"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* PDF content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-2 bg-gray-200"
        onMouseUp={handleTextSelection}
      />
    </div>
  );
};

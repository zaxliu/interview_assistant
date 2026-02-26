import * as pdfjsLib from 'pdfjs-dist';

// Set up worker - version must match the installed pdfjs-dist version
const pdfjsVersion = pdfjsLib.version;
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

// Configure CMap for CJK font support - use unpkg CDN
const CMAP_URL = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/cmaps/`;
const STANDARD_FONT_DATA_URL = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/standard_fonts/`;

console.log('[PDF Config] Version:', pdfjsVersion);
console.log('[PDF Config] CMap URL:', CMAP_URL);
console.log('[PDF Config] Font URL:', STANDARD_FONT_DATA_URL);

interface AIParseConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Parse PDF from file upload (standard text extraction)
 */
export const parsePDFFromFile = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  return parsePDF(arrayBuffer);
};

/**
 * Parse PDF from URL (standard text extraction)
 */
export const parsePDFFromUrl = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return parsePDF(arrayBuffer);
};

/**
 * Parse PDF from ArrayBuffer (standard text extraction)
 */
const parsePDF = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;

  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map((item) => {
        if ('str' in item) {
          return item.str;
        }
        return '';
      })
      .join(' ');

    fullText += pageText + '\n';
  }

  return fullText.trim();
};

/**
 * Convert PDF page to base64 image with high quality
 */
const pdfPageToImage = async (page: pdfjsLib.PDFPageProxy, scale: number = 3): Promise<string> => {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  // Set white background for better OCR
  context!.fillStyle = '#FFFFFF';
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  context!.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: context!,
    viewport,
    background: 'white',
  }).promise;

  // Use JPEG for smaller file size while maintaining quality
  return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
};

/**
 * Debug: Download PDF page as image for inspection
 */
export const debugDownloadPDFPageAsImage = async (
  file: File,
  pageIndex: number = 0,
  scale: number = 3
): Promise<void> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;
  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  context!.fillStyle = '#FFFFFF';
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  context!.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: context!,
    viewport,
    background: 'white',
  }).promise;

  // Download the image
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `pdf_page_${pageIndex + 1}.jpg`;
  link.click();

  console.log(`[Debug] Downloaded page ${pageIndex + 1} as image (${Math.round(dataUrl.length / 1024)}KB)`);
};

/**
 * Debug: Get PDF page as data URL for inspection
 */
export const debugGetPDFPageDataUrl = async (
  file: File,
  pageIndex: number = 0,
  scale: number = 3
): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;
  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  context!.fillStyle = '#FFFFFF';
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  context!.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: context!,
    viewport,
    background: 'white',
  }).promise;

  return canvas.toDataURL('image/jpeg', 0.95);
};

/**
 * Parse PDF using AI Vision (converts pages to images and sends to AI)
 * Uses OpenAI-compatible chat/completions endpoint with image_url format
 */
export const parsePDFWithAI = async (
  arrayBuffer: ArrayBuffer,
  config: AIParseConfig,
  options?: {
    maxPages?: number;
    scale?: number;
    extractStructured?: boolean;
  }
): Promise<string> => {
  const { maxPages = 10, scale = 3, extractStructured = true } = options || {};

  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;
  const pagesToProcess = Math.min(pdf.numPages, maxPages);

  console.log(`[AI PDF Parse] Processing ${pagesToProcess} of ${pdf.numPages} pages with scale ${scale}`);

  // Process each page individually for better results
  const pageTexts: string[] = [];

  for (let i = 1; i <= pagesToProcess; i++) {
    const page = await pdf.getPage(i);
    const imageBase64 = await pdfPageToImage(page, scale);
    console.log(`[AI PDF Parse] Page ${i} converted to image, size: ${Math.round(imageBase64.length / 1024)}KB`);

    // Process each page separately to avoid token limits
    const pagePrompt = extractStructured
      ? `请仔细阅读这张简历/文档图片，提取所有文字内容。

要求：
1. 完整提取所有文字，不要遗漏任何内容
2. 保持原文的结构和格式（标题、段落、列表等）
3. 保留所有数字、日期、专有名词
4. 如果有表格，用清晰的格式呈现
5. 不要总结、不要改写、不要添加任何评论

直接输出提取的文字内容：`
      : `Extract all text content from this document image. Output the exact text without any summary or modification.`;

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: pagePrompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
            },
          },
        ],
      },
    ];

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error(`[AI PDF Parse] Page ${i} failed:`, error);
        continue;
      }

      const data = await response.json();
      const pageText = data.choices[0]?.message?.content || '';
      pageTexts.push(`--- 第 ${i} 页 ---\n${pageText}`);
      console.log(`[AI PDF Parse] Page ${i} extracted: ${pageText.length} chars`);
    } catch (error) {
      console.error(`[AI PDF Parse] Page ${i} error:`, error);
    }

    // Small delay between pages to avoid rate limits
    if (i < pagesToProcess) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const fullText = pageTexts.join('\n\n');
  console.log(`[AI PDF Parse] Total extracted: ${fullText.length} characters from ${pageTexts.length} pages`);

  return fullText;
};

/**
 * Parse PDF from file using AI (image-based extraction)
 */
export const parsePDFFromFileWithAI = async (
  file: File,
  config: AIParseConfig,
  options?: {
    maxPages?: number;
    scale?: number;
    extractStructured?: boolean;
  }
): Promise<string> => {
  console.log(`[AI PDF Parse] Using image-based extraction for model: ${config.model}`);
  const arrayBuffer = await file.arrayBuffer();
  return parsePDFWithAI(arrayBuffer, config, options);
};

/**
 * Parse PDF from URL using AI Vision
 */
export const parsePDFFromUrlWithAI = async (
  url: string,
  config: AIParseConfig,
  options?: {
    maxPages?: number;
    scale?: number;
    extractStructured?: boolean;
  }
): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return parsePDFWithAI(arrayBuffer, config, options);
};

/**
 * Smart PDF parsing - tries standard extraction first, falls back to AI if result is poor
 */
export const parsePDFSmart = async (
  arrayBuffer: ArrayBuffer,
  config?: AIParseConfig,
  options?: {
    minTextLength?: number;
    maxPages?: number;
  }
): Promise<{ text: string; method: 'standard' | 'ai' }> => {
  const { minTextLength = 100 } = options || {};

  // Try standard extraction first
  const standardText = await parsePDF(arrayBuffer);

  // If we got good results, return them
  if (standardText.length >= minTextLength) {
    console.log(`[Smart PDF Parse] Standard extraction successful (${standardText.length} chars)`);
    return { text: standardText, method: 'standard' };
  }

  // If standard extraction failed or returned too little text, try AI
  if (config) {
    console.log(`[Smart PDF Parse] Standard extraction poor (${standardText.length} chars), trying AI...`);
    try {
      const aiText = await parsePDFWithAI(arrayBuffer, config, options);
      return { text: aiText, method: 'ai' };
    } catch (error) {
      console.error('[Smart PDF Parse] AI extraction failed:', error);
      // Return whatever we got from standard extraction
      return { text: standardText, method: 'standard' };
    }
  }

  // No AI config, return standard result
  return { text: standardText, method: 'standard' };
};


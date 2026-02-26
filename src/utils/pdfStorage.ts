const DB_NAME = 'interview-assistant-pdf';
const STORE_NAME = 'pdfs';
const DB_VERSION = 1;

interface PDFRecord {
  candidateId: string;
  fileData: ArrayBuffer;
  filename: string;
  timestamp: number;
}

let dbInstance: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'candidateId' });
      }
    };
  });
};

/**
 * Store PDF file in IndexedDB
 */
export const storePDF = async (
  candidateId: string,
  file: File
): Promise<void> => {
  console.log('[pdfStorage] Storing PDF for candidate:', candidateId, 'file:', file.name, 'size:', file.size);

  const db = await openDB();

  const arrayBuffer = await file.arrayBuffer();
  console.log('[pdfStorage] ArrayBuffer created, size:', arrayBuffer.byteLength);

  const record: PDFRecord = {
    candidateId,
    fileData: arrayBuffer,
    filename: file.name,
    timestamp: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(record);

    request.onsuccess = () => {
      console.log('[pdfStorage] PDF stored successfully for candidate:', candidateId);
      resolve();
    };

    request.onerror = () => {
      console.error('[pdfStorage] Failed to store PDF:', request.error);
      reject(new Error('Failed to store PDF'));
    };
  });
};

/**
 * Retrieve PDF file from IndexedDB
 */
export const getPDF = async (
  candidateId: string
): Promise<{ data: ArrayBuffer; filename: string } | null> => {
  console.log('[pdfStorage] Getting PDF for candidate:', candidateId);
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(candidateId);

    request.onsuccess = () => {
      const record = request.result as PDFRecord | undefined;
      if (record) {
        console.log('[pdfStorage] PDF found for candidate:', candidateId, 'filename:', record.filename, 'size:', record.fileData.byteLength);
        resolve({ data: record.fileData, filename: record.filename });
      } else {
        console.log('[pdfStorage] No PDF found for candidate:', candidateId);
        resolve(null);
      }
    };

    request.onerror = () => {
      console.error('[pdfStorage] Failed to retrieve PDF:', request.error);
      reject(new Error('Failed to retrieve PDF'));
    };
  });
};

/**
 * Delete PDF file from IndexedDB
 */
export const deletePDF = async (candidateId: string): Promise<void> => {
  console.log('[pdfStorage] Deleting PDF for candidate:', candidateId);
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(candidateId);

    request.onsuccess = () => {
      console.log('[pdfStorage] PDF deleted successfully');
      resolve();
    };

    request.onerror = () => {
      console.error('[pdfStorage] Failed to delete PDF:', request.error);
      reject(new Error('Failed to delete PDF'));
    };
  });
};

/**
 * Debug: List all stored PDFs
 */
export const listAllPDFs = async (): Promise<string[]> => {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAllKeys();

    request.onsuccess = () => {
      const keys = request.result as string[];
      console.log('[pdfStorage] All stored PDFs:', keys);
      resolve(keys);
    };

    request.onerror = () => {
      console.error('[pdfStorage] Failed to list PDFs:', request.error);
      reject(new Error('Failed to list PDFs'));
    };
  });
};

// Expose debug function to window for console access
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).debugPDFStorage = {
    listAll: listAllPDFs,
    get: getPDF,
    delete: deletePDF,
    test: async () => {
      // Test storing a small PDF
      const testId = 'test-' + Date.now();
      const testContent = new TextEncoder().encode('%PDF-1.4\ntest');
      const testFile = new File([testContent], 'test.pdf', { type: 'application/pdf' });
      try {
        await storePDF(testId, testFile);
        const retrieved = await getPDF(testId);
        if (!retrieved) {
          throw new Error('PDF was not stored correctly');
        }
        await deletePDF(testId);
        console.log('[pdfStorage] Test passed! PDF storage is working correctly.');
        return true;
      } catch (error) {
        console.error('[pdfStorage] Test failed:', error);
        return false;
      }
    },
  };
  console.log('[pdfStorage] Debug functions available at window.debugPDFStorage');
  console.log('[pdfStorage] Available methods: listAll(), get(id), delete(id), test()');
}

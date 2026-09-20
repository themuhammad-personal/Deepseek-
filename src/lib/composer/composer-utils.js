/**
 * Helper utilities for Dynamic Composer & Chip Previews
 */

/**
 * Classifies a file into a UI category for Claude-style chip presentation.
 * @param {File|{name: string, type?: string}} file
 * @returns {'image'|'pdf'|'doc'|'sheet'|'presentation'|'archive'|'code'|'text'|'file'}
 */
export function getFileCategory(file) {
  if (!file) return "file";
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();

  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp|ico|heic)$/i.test(name)) {
    return "image";
  }
  if (type === "application/pdf" || name.endsWith(".pdf")) {
    return "pdf";
  }
  if (type.includes("word") || /\.(docx?|odt|rtf)$/i.test(name)) {
    return "doc";
  }
  if (type.includes("sheet") || type.includes("csv") || /\.(xlsx?|csv|tsv|ods)$/i.test(name)) {
    return "sheet";
  }
  if (type.includes("presentation") || /\.(pptx?|key|odp)$/i.test(name)) {
    return "presentation";
  }
  if (type.includes("zip") || type.includes("compressed") || type.includes("tar") || /\.(zip|tar|gz|7z|rar)$/i.test(name)) {
    return "archive";
  }
  if (
    /\.(js|ts|jsx|tsx|svelte|vue|py|rb|java|c|cpp|cs|go|rs|php|html|css|scss|json|xml|yaml|yml|sh|bash|sql)$/i.test(name) ||
    type.includes("javascript") || type.includes("json") || type.includes("xml")
  ) {
    return "code";
  }
  if (type.startsWith("text/") || /\.(txt|md|markdown|log)$/i.test(name)) {
    return "text";
  }
  return "file";
}

/**
 * Formats file size in bytes to a human readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/**
 * Safely updates input.files using DataTransfer, with fallback for JSDOM / test runners.
 * @param {HTMLInputElement} input
 * @param {File[]} fileArray
 */
export function setInputFiles(input, fileArray) {
  if (!input) return;
  const arr = Array.from(fileArray || []);
  try {
    if (typeof DataTransfer !== "undefined") {
      const dt = new DataTransfer();
      for (const f of arr) {
        dt.items.add(f);
      }
      input.files = dt.files;
      return;
    }
  } catch {
    // fallback for environments with strict FileList checks (like JSDOM)
  }

  try {
    Object.defineProperty(input, "files", {
      configurable: true,
      writable: true,
      value: arr,
    });
  } catch {
    // ignore
  }
}

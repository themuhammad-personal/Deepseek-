// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ComposerChips from "../../../src/content/ui/ComposerChips.svelte";
import { getFileCategory, formatFileSize, setInputFiles } from "../../../src/lib/composer/composer-utils.js";
import { renderSvelte, flushUi } from "../../helpers/svelte.js";

function setupDom() {
  document.body.innerHTML = `
    <div class="ds-textarea">
      <textarea id="chat-input" style="min-height: 48px; line-height: 24px;"></textarea>
      <input type="file" multiple style="display:none;" />
    </div>
  `;
  const fileInput = document.querySelector('input[type="file"]');
  Object.defineProperty(fileInput, "files", {
    configurable: true,
    writable: true,
    value: [],
  });
  const textarea = document.querySelector("textarea#chat-input");
  return { fileInput, textarea };
}

describe("ComposerChips and Dynamic Composer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("File classification & formatting helpers", () => {
    it("classifies image files correctly", () => {
      expect(getFileCategory({ name: "photo.jpg", type: "image/jpeg" })).toBe("image");
      expect(getFileCategory({ name: "diagram.png", type: "image/png" })).toBe("image");
      expect(getFileCategory({ name: "banner.webp", type: "image/webp" })).toBe("image");
      expect(getFileCategory({ name: "icon.svg", type: "image/svg+xml" })).toBe("image");
    });

    it("classifies document, sheet, presentation, and archive files correctly", () => {
      expect(getFileCategory({ name: "whitepaper.pdf", type: "application/pdf" })).toBe("pdf");
      expect(getFileCategory({ name: "report.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })).toBe("doc");
      expect(getFileCategory({ name: "data.csv", type: "text/csv" })).toBe("sheet");
      expect(getFileCategory({ name: "metrics.xlsx", type: "" })).toBe("sheet");
      expect(getFileCategory({ name: "slides.pptx", type: "" })).toBe("presentation");
      expect(getFileCategory({ name: "bundle.zip", type: "application/zip" })).toBe("archive");
      expect(getFileCategory({ name: "backup.tar.gz", type: "" })).toBe("archive");
    });

    it("classifies code and text files correctly", () => {
      expect(getFileCategory({ name: "app.js", type: "text/javascript" })).toBe("code");
      expect(getFileCategory({ name: "main.py", type: "" })).toBe("code");
      expect(getFileCategory({ name: "styles.css", type: "text/css" })).toBe("code");
      expect(getFileCategory({ name: "schema.json", type: "application/json" })).toBe("code");
      expect(getFileCategory({ name: "notes.txt", type: "text/plain" })).toBe("text");
      expect(getFileCategory({ name: "README.md", type: "" })).toBe("text");
    });

    it("formats file sizes cleanly", () => {
      expect(formatFileSize(0)).toBe("0 B");
      expect(formatFileSize(512)).toBe("512 B");
      expect(formatFileSize(2048)).toBe("2.0 KB");
      expect(formatFileSize(1572864)).toBe("1.5 MB");
    });
  });

  describe("Component mounting and chip previews", () => {
    it("attaches before the textarea inside the composer container", async () => {
      const { fileInput, textarea } = setupDom();

      renderSvelte(ComposerChips, { nativeInput: fileInput });
      await flushUi();

      const chipRoot = document.querySelector(".bds-composer-chips");
      expect(chipRoot).toBeTruthy();
      // By default with 0 files, it is marked as empty
      expect(chipRoot.classList.contains("bds-composer-chips-empty")).toBe(true);
    });

    it("renders Claude-style chips when files are attached to nativeInput", async () => {
      const { fileInput } = setupDom();

      // Create fake files
      const imgFile = new File(["dummy-image"], "avatar.png", { type: "image/png" });
      const docFile = new File(["dummy-doc"], "contract.pdf", { type: "application/pdf" });

      setInputFiles(fileInput, [imgFile, docFile]);

      // Mock URL.createObjectURL
      const origCreateObjectURL = URL.createObjectURL;
      const origRevokeObjectURL = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn(() => "blob:http://localhost/fake-img");
      URL.revokeObjectURL = vi.fn();

      renderSvelte(ComposerChips, { nativeInput: fileInput });
      await flushUi();

      const chips = document.querySelectorAll(".bds-chip-item");
      expect(chips.length).toBe(2);

      // First chip is image
      const imgChip = chips[0];
      expect(imgChip.classList.contains("bds-chip-image")).toBe(true);
      expect(imgChip.textContent).toContain("avatar.png");
      const thumb = imgChip.querySelector(".bds-chip-thumb");
      expect(thumb).toBeTruthy();
      expect(thumb.src).toContain("fake-img");

      // Second chip is PDF
      const pdfChip = chips[1];
      expect(pdfChip.classList.contains("bds-chip-pdf")).toBe(true);
      expect(pdfChip.textContent).toContain("contract.pdf");

      // Header shows count
      const header = document.querySelector(".bds-composer-chips-count");
      expect(header.textContent).toContain("2");

      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
    });

    it("removes an individual file chip and updates nativeInput", async () => {
      const { fileInput } = setupDom();
      const file1 = new File(["file1"], "doc1.txt", { type: "text/plain" });
      const file2 = new File(["file2"], "doc2.txt", { type: "text/plain" });

      setInputFiles(fileInput, [file1, file2]);

      const changeSpy = vi.fn();
      fileInput.addEventListener("change", changeSpy);

      renderSvelte(ComposerChips, { nativeInput: fileInput });
      await flushUi();

      expect(document.querySelectorAll(".bds-chip-item").length).toBe(2);

      // Click remove on the first chip
      const removeBtns = document.querySelectorAll(".bds-chip-remove");
      removeBtns[0].click();
      await flushUi();

      // Native input updated
      expect(fileInput.files.length).toBe(1);
      expect(fileInput.files[0].name).toBe("doc2.txt");
      expect(changeSpy).toHaveBeenCalled();

      // UI updated
      expect(document.querySelectorAll(".bds-chip-item").length).toBe(1);
    });

    it("clears all files when clearAll is clicked", async () => {
      const { fileInput } = setupDom();
      const file1 = new File(["file1"], "doc1.txt", { type: "text/plain" });
      const file2 = new File(["file2"], "doc2.txt", { type: "text/plain" });

      setInputFiles(fileInput, [file1, file2]);

      renderSvelte(ComposerChips, { nativeInput: fileInput });
      await flushUi();

      const clearAllBtn = document.querySelector(".bds-composer-clear-all");
      expect(clearAllBtn).toBeTruthy();
      clearAllBtn.click();
      await flushUi();

      expect(fileInput.files.length).toBe(0);
      expect(document.querySelectorAll(".bds-chip-item").length).toBe(0);
      expect(document.querySelector(".bds-composer-chips").classList.contains("bds-composer-chips-empty")).toBe(true);
    });

    it("handles clipboard image paste directly into textarea", async () => {
      const { fileInput, textarea } = setupDom();

      renderSvelte(ComposerChips, { nativeInput: fileInput });
      await flushUi();

      const pastedFile = new File(["clip-data"], "pasted-screenshot.png", { type: "image/png" });
      const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
      pasteEvent.clipboardData = {
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => pastedFile,
          },
        ],
      };

      textarea.dispatchEvent(pasteEvent);
      await flushUi();

      expect(fileInput.files.length).toBe(1);
      expect(fileInput.files[0].name).toBe("pasted-screenshot.png");
    });
  });
});

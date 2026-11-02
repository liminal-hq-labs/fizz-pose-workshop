// Supplies the minimal browser file/XML APIs needed by Three.js's geometry and glTF tools in Bun.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { DOMParser } from "@xmldom/xmldom";
export function installThreeToolRuntime(): void {
  if (typeof globalThis.DOMParser === "undefined") {
    class ToolDOMParser {
      parseFromString(text: string, mime: string): Document {
        const document = new DOMParser().parseFromString(
          text,
          mime as "image/svg+xml",
        );
        Object.assign(document, {
          querySelectorAll: (selector: string) =>
            selector
              .split(",")
              .flatMap((tag) =>
                Array.from(document.getElementsByTagName(tag.trim())),
              ),
        });
        // SVGLoader consumes XML nodes; this adapter adds its small selector surface to xmldom.
        return document as unknown as Document;
      }
    }
    globalThis.DOMParser =
      ToolDOMParser as unknown as typeof globalThis.DOMParser;
  }
  if (typeof globalThis.FileReader === "undefined") {
    class ToolFileReader {
      result: ArrayBuffer | string | null = null;
      onloadend: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      readAsArrayBuffer(blob: Blob): void {
        void blob
          .arrayBuffer()
          .then((value) => {
            this.result = value;
            this.onloadend?.({ target: this });
          })
          .catch((error) => this.onerror?.(error));
      }
      readAsDataURL(blob: Blob): void {
        void blob
          .arrayBuffer()
          .then((value) => {
            this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(value).toString("base64")}`;
            this.onloadend?.({ target: this });
          })
          .catch((error) => this.onerror?.(error));
      }
    }
    // GLTFExporter only needs these asynchronous Blob reads; browser builds use native FileReader.
    globalThis.FileReader =
      ToolFileReader as unknown as typeof globalThis.FileReader;
  }
}

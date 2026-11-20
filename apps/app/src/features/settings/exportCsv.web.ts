import { fetchCsv, EXPORT_FILE_NAME } from "./exportRequest";

export async function exportCsv(): Promise<void> {
  const res = await fetchCsv();
  const url = URL.createObjectURL(await res.blob()); // blob keeps the server's bytes, BOM included
  try {
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: EXPORT_FILE_NAME,
    });
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

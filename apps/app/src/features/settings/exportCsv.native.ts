import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { fetchCsv, EXPORT_FILE_NAME } from "./exportRequest";

export async function exportCsv(): Promise<void> {
  const res = await fetchCsv();
  // Bytes, not text(): text() strips a leading UTF-8 BOM, which Excel needs for non-ASCII text.
  const bytes = new Uint8Array(await res.arrayBuffer());
  const file = new File(Paths.cache, EXPORT_FILE_NAME);
  try {
    file.create({ overwrite: true });
    await file.write(bytes); // SDK 58: write() is async and accepts Uint8Array
    await Sharing.shareAsync(file.uri, {
      mimeType: "text/csv",
      UTI: "public.comma-separated-values-text",
    });
  } finally {
    // Privacy: do not leave the full export in the cache (best effort, never masks the share error).
    try {
      if (file.exists) file.delete();
    } catch {
      /* ignore */
    }
  }
}

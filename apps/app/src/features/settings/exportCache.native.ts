import { File, Paths } from "expo-file-system";
import { EXPORT_FILE_NAME } from "./exportRequest";

/** Removes a left-over export file (called by clearLocalData). */
export function deleteExportCache(): void {
  const file = new File(Paths.cache, EXPORT_FILE_NAME);
  if (file.exists) file.delete();
}

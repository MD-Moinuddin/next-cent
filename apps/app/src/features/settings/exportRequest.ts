import { getAuthToken } from "@/lib/api";
import { config } from "@/lib/config";
import { ApiError, NetworkError, NotSignedInError } from "@/lib/query/errors";

export const EXPORT_FILE_NAME = "nextcent-export.csv";

/**
 * Authenticated CSV request. Throws NotSignedInError without a token, NetworkError when offline and
 * ApiError for a non-OK response.
 */
export async function fetchCsv(): Promise<Response> {
  const token = await getAuthToken();
  if (!token) throw new NotSignedInError();
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}/v1/export.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    throw new NetworkError(e);
  }
  if (!res.ok) throw new ApiError(res.status);
  return res;
}

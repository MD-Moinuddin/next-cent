import { client } from "./generated/client.gen";

export * from "./generated";
export { client };

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
}

let currentGetToken: ApiClientOptions["getToken"] | null = null;
let interceptorRegistered = false;

/**
 * Points the generated client at the API and adds `Authorization: Bearer <token>`
 * to every request. Safe to call more than once (the latest options win).
 */
export function configureApiClient({
  baseUrl,
  getToken,
}: ApiClientOptions): void {
  client.setConfig({ baseUrl });
  currentGetToken = getToken;
  if (interceptorRegistered) return;
  interceptorRegistered = true;
  client.interceptors.request.use(async (request) => {
    const token = currentGetToken ? await currentGetToken() : null;
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  });
}

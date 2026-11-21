import { setTokenGetter } from "@/lib/api";
import { ApiError, NetworkError } from "@/lib/query/errors";
import { exportCsv } from "./exportCsv.web";

let fetchMock: jest.Mock;
let click: jest.Mock;
let anchor: { href?: string; download?: string; click: jest.Mock };
const createObjectURL = jest.fn((_b?: unknown) => "blob:csv-1");
const revokeObjectURL = jest.fn();

beforeEach(() => {
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  click = jest.fn();
  anchor = { click };
  Object.assign(globalThis, {
    document: { createElement: jest.fn(() => anchor) },
    URL: Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL }),
  });
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  setTokenGetter(async () => "tok");
});
afterEach(() => setTokenGetter(null));

it("fetches with the bearer token, downloads a blob and revokes the object URL", async () => {
  fetchMock.mockResolvedValue(
    new Response("id,amount\n1,14.50\n", { status: 200 }),
  );
  await exportCsv();
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe("http://localhost:8000/v1/export.csv");
  expect((init as RequestInit).headers).toEqual({
    Authorization: "Bearer tok",
  });
  expect(createObjectURL).toHaveBeenCalledTimes(1);
  expect(anchor.href).toBe("blob:csv-1");
  expect(anchor.download).toBe("nextcent-export.csv");
  expect(click).toHaveBeenCalledTimes(1);
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:csv-1");
});

it("throws on a non-OK response and creates no object URL", async () => {
  fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
  await expect(exportCsv()).rejects.toBeInstanceOf(ApiError);
  expect(createObjectURL).not.toHaveBeenCalled();
  expect(click).not.toHaveBeenCalled();
});

it("throws NetworkError when the request cannot be made", async () => {
  fetchMock.mockRejectedValue(new TypeError("Network request failed"));
  await expect(exportCsv()).rejects.toBeInstanceOf(NetworkError);
});

it("downloads exactly the response bytes, BOM included", async () => {
  const bytes = new Uint8Array([
    0xef,
    0xbb,
    0xbf,
    ...new TextEncoder().encode("café,14.50\n"),
  ]);
  fetchMock.mockResolvedValue(new Response(bytes, { status: 200 }));
  await exportCsv();
  const blob = createObjectURL.mock.calls[0]![0] as unknown as Blob;
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
});

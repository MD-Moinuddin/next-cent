import * as Sharing from "expo-sharing";
import { setTokenGetter } from "@/lib/api";
import { ApiError, NetworkError } from "@/lib/query/errors";
import { exportCsv } from "./exportCsv.native";

const mockWrite = jest.fn(async (_c: unknown) => undefined);
const mockCreate = jest.fn();
const mockDelete = jest.fn();
let mockExists = true;
jest.mock("expo-file-system", () => ({
  Paths: { cache: "cache-dir" },
  File: jest.fn().mockImplementation((dir: string, name: string) => ({
    uri: `file://${dir}/${name}`,
    get exists() {
      return mockExists;
    },
    create: (...a: unknown[]) => mockCreate(...a),
    write: (c: unknown) => mockWrite(c),
    delete: () => mockDelete(),
  })),
}));
jest.mock("expo-sharing", () => ({
  shareAsync: jest.fn(async () => undefined),
}));

let fetchMock: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  mockExists = true;
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  setTokenGetter(async () => "tok");
});
afterEach(() => setTokenGetter(null));

const bom = new Uint8Array([
  0xef,
  0xbb,
  0xbf,
  ...new TextEncoder().encode("café,14.50\n"),
]);

it("writes the exact response bytes (BOM kept), shares, then deletes the file", async () => {
  fetchMock.mockResolvedValue(new Response(bom, { status: 200 }));
  await exportCsv();
  expect(fetchMock.mock.calls[0]![1]).toEqual({
    headers: { Authorization: "Bearer tok" },
  });
  expect(mockCreate).toHaveBeenCalledWith({ overwrite: true });
  const written = mockWrite.mock.calls[0]![0] as Uint8Array;
  expect(written).toBeInstanceOf(Uint8Array);
  expect(written).toEqual(bom);
  expect(Sharing.shareAsync).toHaveBeenCalledWith(
    "file://cache-dir/nextcent-export.csv",
    expect.objectContaining({ mimeType: "text/csv" }),
  );
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

it("deletes the file and rethrows the share error when sharing fails", async () => {
  fetchMock.mockResolvedValue(new Response(bom, { status: 200 }));
  jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error("share"));
  await expect(exportCsv()).rejects.toThrow("share");
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

it("does not mask the share result when deleting throws", async () => {
  fetchMock.mockResolvedValue(new Response(bom, { status: 200 }));
  mockDelete.mockImplementationOnce(() => {
    throw new Error("rm");
  });
  await expect(exportCsv()).resolves.toBeUndefined();
});

it("throws ApiError on a non-OK response without writing or sharing", async () => {
  fetchMock.mockResolvedValue(new Response("nope", { status: 401 }));
  await expect(exportCsv()).rejects.toBeInstanceOf(ApiError);
  expect(mockWrite).not.toHaveBeenCalled();
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

it("throws NetworkError when offline", async () => {
  fetchMock.mockRejectedValue(new TypeError("Network request failed"));
  await expect(exportCsv()).rejects.toBeInstanceOf(NetworkError);
});

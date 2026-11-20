import { setTokenGetter } from "@/lib/api";
import { NotSignedInError } from "@/lib/query/errors";
import { fetchCsv } from "./exportRequest";

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => setTokenGetter(null));

it("throws NotSignedInError and sends nothing when there is no token getter", async () => {
  setTokenGetter(null);
  await expect(fetchCsv()).rejects.toBeInstanceOf(NotSignedInError);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("throws NotSignedInError and sends nothing when the token is null", async () => {
  setTokenGetter(async () => null);
  await expect(fetchCsv()).rejects.toBeInstanceOf(NotSignedInError);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("sends the bearer token when signed in", async () => {
  setTokenGetter(async () => "tok");
  fetchMock.mockResolvedValue(new Response("a,b\n", { status: 200 }));
  await fetchCsv();
  expect(fetchMock.mock.calls[0]![1]).toEqual({
    headers: { Authorization: "Bearer tok" },
  });
});

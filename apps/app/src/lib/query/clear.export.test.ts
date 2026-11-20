import { clearLocalData } from "./clear";

const mockDelete = jest.fn();
let mockExists = true;
jest.mock("expo-file-system", () => ({
  Paths: { cache: "cache-dir" },
  File: jest.fn().mockImplementation(() => ({
    get exists() {
      return mockExists;
    },
    delete: () => mockDelete(),
  })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockExists = true;
});

it("removes a left-over CSV export from the cache", async () => {
  await clearLocalData();
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

it("still clears when removing the file throws", async () => {
  mockDelete.mockImplementationOnce(() => {
    throw new Error("rm");
  });
  await expect(clearLocalData()).resolves.toBeUndefined();
});

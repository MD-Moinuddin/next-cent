import { deleteExportCache as deleteWeb } from "./exportCache.web";
import { deleteExportCache as deleteNative } from "./exportCache.native";

const mockDelete = jest.fn();
let mockExists = true;
jest.mock("expo-file-system", () => ({
  Paths: { cache: "cache-dir" },
  File: jest.fn().mockImplementation((dir: string, name: string) => ({
    uri: `${dir}/${name}`,
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

it("native removes a left-over export file", () => {
  deleteNative();
  expect(mockDelete).toHaveBeenCalledTimes(1);
});
it("native does nothing when there is no file", () => {
  mockExists = false;
  deleteNative();
  expect(mockDelete).not.toHaveBeenCalled();
});
it("web is a no-op", () => {
  expect(() => deleteWeb()).not.toThrow();
  expect(mockDelete).not.toHaveBeenCalled();
});

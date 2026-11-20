import type { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { t } from "@/i18n/strings";
import { api } from "@/lib/api";
import { ApiError, NetworkError } from "@/lib/query/errors";
import { queryKeys } from "@/lib/query/queryClient";
import { cat, categories } from "@/test/fixtures";
import {
  createTestClient,
  disposeClient,
  pressAndSettle,
  settle,
  wrapperFor,
} from "@/test/wrapper";
import { CategoriesScreen } from "./CategoriesScreen";

jest.mock("@/lib/api", () => ({
  api: {
    listCategories: jest.fn(),
    createCategory: jest.fn(),
    patchCategory: jest.fn(),
  },
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
const mocked = jest.mocked(api);

const archivedCat = cat("c-old", "Old stuff", {
  archived_at: "2026-10-01T00:00:00Z",
});
let client: QueryClient;

async function setup(list = [...categories, archivedCat]) {
  mocked.listCategories.mockResolvedValue(list);
  client.setQueryData(queryKeys.categories(true), list);
  await render(<CategoriesScreen />, { wrapper: wrapperFor(client) });
}

beforeEach(() => {
  jest.clearAllMocks();
  client = createTestClient();
});
afterEach(() => disposeClient(client));

it("lists active categories and shows archived ones dimmed with a Restore action", async () => {
  await setup();
  expect(screen.getByText("x Dining")).toBeTruthy();
  expect(screen.getByText(t.categories.archived)).toBeTruthy();
  expect(screen.getByLabelText("Restore Old stuff")).toBeTruthy();
  expect(screen.getByLabelText("Archive Dining")).toBeTruthy();
});

it("creates a category and closes the form", async () => {
  await setup();
  mocked.createCategory.mockResolvedValue(cat("c-new", "Pets"));
  await fireEvent.press(screen.getByTestId("category-new"));
  await fireEvent.changeText(screen.getByTestId("category-name"), "  Pets ");
  await fireEvent.changeText(screen.getByTestId("category-icon"), "🐶");
  await fireEvent.press(screen.getByTestId("category-color-1"));
  await pressAndSettle(screen.getByTestId("category-save"));
  expect(mocked.createCategory).toHaveBeenCalledWith({
    name: "Pets",
    icon: "🐶",
    color: "#047857",
  });
  expect(screen.queryByTestId("category-save")).toBeNull();
  // the lists are refetched
  expect(mocked.listCategories).toHaveBeenCalled();
});

it("validates the name and icon before calling the API", async () => {
  await setup();
  await fireEvent.press(screen.getByTestId("category-new"));
  await pressAndSettle(screen.getByTestId("category-save"));
  expect(screen.getByText(t.errors.name_required)).toBeTruthy();
  await fireEvent.changeText(screen.getByTestId("category-name"), "Ok");
  await fireEvent.changeText(
    screen.getByTestId("category-icon"),
    "x".repeat(17),
  );
  await pressAndSettle(screen.getByTestId("category-save"));
  expect(mocked.createCategory).not.toHaveBeenCalled();
});

it("shows the duplicate-name error and keeps the form open", async () => {
  await setup();
  mocked.createCategory.mockRejectedValue(
    new ApiError(409, { code: "category_exists" }),
  );
  await fireEvent.press(screen.getByTestId("category-new"));
  await fireEvent.changeText(screen.getByTestId("category-name"), "Dining");
  await pressAndSettle(screen.getByTestId("category-save"));
  expect(screen.getByText(t.errors.category_exists)).toBeTruthy();
  expect(screen.getByTestId("category-save")).toBeTruthy();
});

it("shows the offline message instead of queueing", async () => {
  await setup();
  mocked.createCategory.mockRejectedValue(new NetworkError(new Error("x")));
  await fireEvent.press(screen.getByTestId("category-new"));
  await fireEvent.changeText(screen.getByTestId("category-name"), "Pets");
  await pressAndSettle(screen.getByTestId("category-save"));
  expect(screen.getByText(t.common.offlineOnly)).toBeTruthy();
});

it("renames a category with a patch", async () => {
  await setup();
  mocked.patchCategory.mockResolvedValue(cat(categories[0]!.id, "Eating out"));
  await fireEvent.press(screen.getByLabelText("Edit Dining"));
  expect(screen.getByTestId("category-name").props.value).toBe("Dining");
  await fireEvent.changeText(screen.getByTestId("category-name"), "Eating out");
  await pressAndSettle(screen.getByTestId("category-save"));
  expect(mocked.patchCategory).toHaveBeenCalledWith(categories[0]!.id, {
    name: "Eating out",
    icon: "x",
    color: null,
  });
  expect(screen.queryByTestId("category-save")).toBeNull();
});

it("archives and restores", async () => {
  await setup();
  mocked.patchCategory.mockResolvedValue(categories[0]!);
  await pressAndSettle(screen.getByLabelText("Archive Dining"));
  expect(mocked.patchCategory).toHaveBeenLastCalledWith(categories[0]!.id, {
    archived: true,
  });
  await pressAndSettle(screen.getByLabelText("Restore Old stuff"));
  expect(mocked.patchCategory).toHaveBeenLastCalledWith("c-old", {
    archived: false,
  });
});

it("shows the offline message when archiving fails offline", async () => {
  await setup();
  mocked.patchCategory.mockRejectedValue(new NetworkError(new Error("x")));
  await pressAndSettle(screen.getByLabelText("Archive Dining"));
  expect(screen.getByText(t.common.offlineOnly)).toBeTruthy();
  await settle();
});

import { expect, test } from "vitest";
import { isValidTLD } from "./index.ts";

test("it marks an ending as valid", () => {
	expect(isValidTLD("com")).toBe(true);
});

test("it marks an ending as invalid", () => {
	expect(isValidTLD("vom")).toBe(false);
});

import { describe, expect, it } from "vitest";
import type { HttpBackendOptions } from "i18next-http-backend";

import i18n from "./index";

describe("i18n locale resources", () => {
  it("revalidates cached locale files before using them", () => {
    const backendOptions = i18n.options.backend as HttpBackendOptions;

    expect(backendOptions.requestOptions).toMatchObject({
      cache: "no-cache",
    });
  });
});

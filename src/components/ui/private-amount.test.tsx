import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrivacyProvider } from "@/components/shell/privacy-provider";
import { PrivateAmount } from "@/components/ui/private-amount";

describe("PrivateAmount", () => {
  it("não revela montantes no HTML antes de a preferência local estar hidratada", () => {
    const html = renderToStaticMarkup(
      createElement(
        PrivacyProvider,
        null,
        createElement(PrivateAmount, { amountCents: 987_654 }),
      ),
    );

    expect(html).toContain("•••• €");
    expect(html).toContain("Valor oculto pelo modo de privacidade");
    expect(html).not.toContain("9 876");
    expect(html).not.toContain("9876");
  });
});

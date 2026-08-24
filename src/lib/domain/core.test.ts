import { describe, expect, it } from "vitest";
import {
  assertValidCents,
  centsToInput,
  formatCurrency,
  formatSignedCurrency,
  parseMoneyToCents,
} from "@/lib/domain/money";
import {
  assertIsoDate,
  daysAgoLabel,
  formatDate,
  todayInLisbon,
} from "@/lib/domain/dates";
import { snapshotContentHash, stableJson } from "@/lib/domain/normalize";
import {
  aggregateChartPoints,
  defaultChartCategoryIds,
  filterChartPoints,
  filterPreviousChartPoints,
} from "@/lib/domain/chart";

describe("money", () => {
  it.each([
    ["12 345,67 €", 1_234_567],
    ["2.500", 250_000],
    ["1.234,56", 123_456],
    ["1,234.56", 123_456],
    ["0,05", 5],
    ["12.5", 1_250],
    ["+20", 2_000],
  ])("converte %s em cêntimos sem usar floating point", (input, expected) => {
    expect(parseMoneyToCents(input)).toBe(expected);
  });

  it("arredonda entradas numéricas para o cêntimo mais próximo", () => {
    expect(parseMoneyToCents(1.005)).toBe(101);
    expect(parseMoneyToCents(0)).toBe(0);
  });

  it.each(["-1", "(10)", "abc", "", "1,234.567"])(
    "rejeita um montante inválido: %j",
    (input) => {
      expect(() => parseMoneyToCents(input)).toThrow();
    },
  );

  it("rejeita cêntimos negativos, não inteiros e acima do limite", () => {
    expect(() => assertValidCents(-1)).toThrow("Montante inválido");
    expect(() => assertValidCents(1.1)).toThrow("Montante inválido");
    expect(() => assertValidCents(Number.MAX_SAFE_INTEGER)).toThrow("Montante inválido");
  });

  it("formata EUR em pt-PT, omitindo apenas cêntimos iguais a zero", () => {
    expect(formatCurrency(1_234_500)).toBe("12\u00a0345\u00a0€");
    expect(formatCurrency(1_234_500, false)).toBe("12\u00a0345,00\u00a0€");
    expect(formatCurrency(1_234_567)).toBe("12\u00a0345,67\u00a0€");
    expect(formatSignedCurrency(1_234_500)).toBe("+12\u00a0345\u00a0€");
    expect(formatSignedCurrency(-1_234_567)).toBe("−12\u00a0345,67\u00a0€");
    expect(formatSignedCurrency(0)).toBe("0\u00a0€");
    expect(centsToInput(1_234_567)).toBe("12345,67");
  });
});

describe("dates", () => {
  it("valida anos bissextos e datas de calendário reais", () => {
    expect(assertIsoDate("2024-02-29")).toBe("2024-02-29");
    expect(() => assertIsoDate("2023-02-29")).toThrow("Data inválida");
    expect(() => assertIsoDate("2026-04-31")).toThrow("Data inválida");
    expect(() => assertIsoDate("27/01/2026")).toThrow("Data inválida");
  });

  it("calcula o dia civil de Lisboa sem depender do timezone do processo", () => {
    expect(todayInLisbon(new Date("2026-08-24T22:59:59.000Z"))).toBe("2026-08-24");
    expect(todayInLisbon(new Date("2026-08-24T23:00:00.000Z"))).toBe("2026-08-25");
    expect(todayInLisbon(new Date("2026-01-01T00:30:00.000Z"))).toBe("2026-01-01");
  });

  it("formata datas e diferenças relativas de modo determinístico", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    expect(formatDate("2026-01-27", "long")).toBe("27 de janeiro de 2026");
    expect(daysAgoLabel("2026-08-24", now)).toBe("hoje");
    expect(daysAgoLabel("2026-08-23", now)).toBe("ontem");
    expect(daysAgoLabel("2026-08-20", now)).toBe("há 4 dias");
  });
});

describe("chart ranges", () => {
  const points = [
    { id: "a", date: "2025-12-31", totalCents: 100, note: null, values: [{ categoryId: "cash", amountCents: 100 }] },
    { id: "b", date: "2026-01-31", totalCents: 120, note: null, values: [{ categoryId: "cash", amountCents: 120 }] },
    { id: "c", date: "2026-02-28", totalCents: 140, note: null, values: [{ categoryId: "cash", amountCents: 140 }] },
    { id: "d", date: "2026-03-31", totalCents: 160, note: null, values: [{ categoryId: "cash", amountCents: 160 }] },
  ];

  it("respeita o fim de meses curtos sem deixar saltar março para o próprio intervalo", () => {
    expect(filterChartPoints(points, "1M").map(({ id }) => id)).toEqual(["c", "d"]);
    expect(filterPreviousChartPoints(points, "1M").map(({ id }) => id)).toEqual(["b"]);
  });

  it("não inventa comparação para o intervalo completo", () => {
    expect(filterPreviousChartPoints(points, "ALL")).toEqual([]);
  });

  it("agrega todo o histórico apenas com as categorias selecionadas", () => {
    const selected = aggregateChartPoints(
      [
        {
          id: "one",
          date: "2026-01-01",
          totalCents: 60_000,
          note: "Primeiro",
          values: [
            { categoryId: "cash", amountCents: 10_000 },
            { categoryId: "brokerage", amountCents: 20_000 },
            { categoryId: "emergency", amountCents: 30_000 },
          ],
        },
        {
          id: "two",
          date: "2026-02-01",
          totalCents: 75_000,
          note: null,
          values: [
            { categoryId: "cash", amountCents: 15_000 },
            { categoryId: "brokerage", amountCents: 25_000 },
            { categoryId: "emergency", amountCents: 35_000 },
          ],
        },
      ],
      ["cash", "brokerage"],
    );

    expect(selected.map((point) => point.totalCents)).toEqual([30_000, 40_000]);
    expect(selected[0]).toMatchObject({ id: "one", note: "Primeiro" });
  });

  it("exclui investimento e poupança da seleção inicial do gráfico", () => {
    expect(
      defaultChartCategoryIds([
        { id: "cash", type: "available" },
        { id: "reserved", type: "reserved" },
        { id: "brokerage", type: "investment" },
        { id: "collection", type: "asset" },
        { id: "emergency", type: "savings" },
      ]),
    ).toEqual(["cash", "reserved", "collection"]);
  });
});

describe("stable hashes", () => {
  const values = [
    { categoryId: "cat-b", amountCents: 20_000 },
    { categoryId: "cat-a", amountCents: 10_000 },
  ];

  it("produz o mesmo hash para conteúdo equivalente independentemente da ordem", () => {
    const first = snapshotContentHash({
      date: "2026-01-27",
      note: "  Transferência  ",
      values,
    });
    const second = snapshotContentHash({
      date: "2026-01-27",
      note: "Transferência",
      values: [...values].reverse(),
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(
      snapshotContentHash({
        date: "2026-01-27",
        note: "Transferência",
        values: [{ categoryId: "cat-a", amountCents: 10_001 }, values[0]],
      }),
    ).not.toBe(first);
  });

  it("serializa objetos com chaves numa ordem estável", () => {
    expect(stableJson({ z: 1, a: { d: false, c: [2, null] } })).toBe(
      '{"a":{"c":[2,null],"d":false},"z":1}',
    );
    expect(stableJson({ a: { c: [2, null], d: false }, z: 1 })).toBe(
      stableJson({ z: 1, a: { d: false, c: [2, null] } }),
    );
  });
});

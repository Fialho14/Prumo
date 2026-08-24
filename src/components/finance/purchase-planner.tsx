"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

import { usePrivacy } from "@/components/shell/privacy-provider";
import { PrivateAmount } from "@/components/ui/private-amount";
import { formatDate } from "@/lib/domain/dates";
import {
  formatCurrency,
  formatPercent,
  parseMoneyToCents,
} from "@/lib/domain/money";
import {
  defaultPurchaseSourceIds,
  simulatePurchase,
  type PurchaseCategory,
} from "@/lib/domain/purchase";
import type { CategoryType } from "@/lib/domain/types";
import { CategoryIcon } from "./category-icon";
import styles from "./purchase-planner.module.css";

type PurchasePlannerProps = {
  categories: PurchasePlannerCategory[];
  currentTotalCents: number;
  snapshotDate: string;
};

export type PurchasePlannerCategory = {
  id: string;
  name: string;
  type: CategoryType;
  color: string;
  icon: string;
  position: number;
  archivedAt: string | null;
  amountCents: number;
};

const TYPE_LABELS: Record<CategoryType, string> = {
  available: "Disponível",
  reserved: "Reservado",
  investment: "Investimento",
  asset: "Ativo",
  savings: "Poupança",
  other: "Outro",
};

function sameSelection(current: readonly string[], expected: readonly string[]): boolean {
  if (current.length !== expected.length) return false;
  const currentSet = new Set(current);
  return expected.every((id) => currentSet.has(id));
}

export function PurchasePlanner({
  categories,
  currentTotalCents,
  snapshotDate,
}: PurchasePlannerProps) {
  const { isPrivacyMode } = usePrivacy();
  const sources = useMemo(
    () => categories.filter((category) => category.amountCents > 0),
    [categories],
  );
  const purchaseCategories = useMemo<PurchaseCategory[]>(
    () =>
      sources.map(({ id, type, position, amountCents }) => ({
        id,
        type,
        position,
        amountCents,
      })),
    [sources],
  );
  const availableIds = useMemo(
    () => defaultPurchaseSourceIds(purchaseCategories),
    [purchaseCategories],
  );
  const everydayIds = useMemo(
    () =>
      sources
        .filter(({ type }) => type !== "savings" && type !== "investment")
        .map(({ id }) => id),
    [sources],
  );
  const allIds = useMemo(() => sources.map(({ id }) => id), [sources]);

  const [description, setDescription] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    defaultPurchaseSourceIds(purchaseCategories),
  );

  const price = useMemo(() => {
    if (!priceInput.trim()) return { cents: 0, error: null, empty: true };
    try {
      return { cents: parseMoneyToCents(priceInput), error: null, empty: false };
    } catch (error) {
      return {
        cents: 0,
        error: error instanceof Error ? error.message : "Introduz um preço válido.",
        empty: false,
      };
    }
  }, [priceInput]);

  const simulation = useMemo(
    () =>
      simulatePurchase({
        costCents: price.cents,
        categories: purchaseCategories,
        selectedCategoryIds: selectedIds,
      }),
    [price.cents, purchaseCategories, selectedIds],
  );
  const allocationById = useMemo(
    () => new Map(simulation.allocations.map((allocation) => [allocation.categoryId, allocation])),
    [simulation.allocations],
  );

  const hasPrice = !price.empty && !price.error && price.cents > 0;
  const isCovered = hasPrice && simulation.fullyFunded;
  const selectedRemainingCents = simulation.capacityCents - simulation.coveredCents;
  const impact = currentTotalCents > 0 ? simulation.coveredCents / currentTotalCents : 0;
  const untouchedNames = sources
    .filter((category) => !allocationById.has(category.id))
    .map((category) => category.name);

  const toggleSource = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((categoryId) => categoryId !== id)
        : [...current, id],
    );
  };

  const reset = () => {
    setDescription("");
    setPriceInput("");
    setSelectedIds(availableIds);
  };

  const resultTitle = price.error
    ? "Revê o preço"
    : !hasPrice
      ? "Começa pelo preço"
      : isCovered
        ? "Compra coberta"
        : `Faltam ${isPrivacyMode ? "•••• €" : formatCurrency(simulation.shortfallCents)}`;

  return (
    <main className={styles.page}>
      <div className={styles.topline}>
        <Link className={styles.backLink} href="/">
          <ArrowLeft aria-hidden="true" size={16} /> Visão geral
        </Link>
        <span className={styles.temporaryLabel}>
          <LockKeyhole aria-hidden="true" size={13} /> Simulação temporária
        </span>
      </div>

      <header className={styles.header}>
        <p className={styles.eyebrow}>Planear antes de gastar</p>
        <h1>E se eu comprar isto?</h1>
        <p>
          Escolhe de onde sai o dinheiro e vê, sem compromissos, o que fica depois.
        </p>
      </header>

      <section className={styles.purchaseInput} aria-labelledby="purchase-heading">
        <div className={styles.descriptionField}>
          <label htmlFor="purchase-description" id="purchase-heading">
            O que estás a pensar comprar? <span>Opcional</span>
          </label>
          <input
            autoComplete="off"
            id="purchase-description"
            maxLength={80}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ex.: MacBook, viagem, carro…"
            type="text"
            value={description}
          />
        </div>
        <div className={styles.priceField}>
          <label htmlFor="purchase-price">Quanto custa?</label>
          <div className={styles.priceControl} data-invalid={Boolean(price.error)}>
            <input
              aria-describedby={price.error ? "purchase-price-error" : undefined}
              aria-invalid={Boolean(price.error)}
              autoComplete="off"
              id="purchase-price"
              inputMode="decimal"
              onChange={(event) => setPriceInput(event.target.value)}
              placeholder="1 500"
              spellCheck={false}
              type={isPrivacyMode ? "password" : "text"}
              value={priceInput}
            />
            <span aria-hidden="true">€</span>
          </div>
          {price.error ? (
            <p className={styles.fieldError} id="purchase-price-error" role="alert">
              {price.error}
            </p>
          ) : null}
        </div>
      </section>

      <div className={styles.plannerGrid}>
        <section className={styles.sourcesPanel} aria-labelledby="sources-heading">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.stepLabel}>01 · Origem</p>
              <h2 id="sources-heading">De onde sai</h2>
            </div>
            <PrivateAmount
              amountCents={simulation.capacityCents}
              className={styles.capacity}
              hiddenLabel="Capacidade selecionada oculta"
            />
          </div>

          <div className={styles.presets} role="group" aria-label="Seleções rápidas de fontes">
            <button
              aria-pressed={sameSelection(selectedIds, availableIds)}
              onClick={() => setSelectedIds(availableIds)}
              type="button"
            >
              Só disponível
            </button>
            <button
              aria-pressed={sameSelection(selectedIds, everydayIds)}
              onClick={() => setSelectedIds(everydayIds)}
              type="button"
            >
              Preservar poupança e investimentos
            </button>
            <button
              aria-pressed={sameSelection(selectedIds, allIds)}
              onClick={() => setSelectedIds(allIds)}
              type="button"
            >
              Usar tudo
            </button>
          </div>

          <fieldset className={styles.sourceList}>
            <legend className="sr-only">Categorias que podem financiar a compra</legend>
            {sources.map((category) => {
              const selected = selectedIds.includes(category.id);
              const allocation = allocationById.get(category.id);
              const allocatedCents = allocation?.allocatedCents ?? 0;
              const remainingCents = category.amountCents - allocatedCents;
              const remainingRatio = category.amountCents > 0
                ? remainingCents / category.amountCents
                : 0;

              return (
                <label
                  className={styles.sourceRow}
                  data-selected={selected}
                  key={category.id}
                >
                  <input
                    checked={selected}
                    onChange={() => toggleSource(category.id)}
                    type="checkbox"
                  />
                  <span className={styles.checkmark} aria-hidden="true">
                    {selected ? <Check size={13} strokeWidth={2.4} /> : null}
                  </span>
                  <span
                    className={styles.categoryIcon}
                    style={{
                      color: category.color,
                      background: `color-mix(in srgb, ${category.color} 14%, transparent)`,
                    }}
                  >
                    <CategoryIcon icon={category.icon} />
                  </span>
                  <span className={styles.sourceIdentity}>
                    <strong>{category.name}</strong>
                    <span>{category.archivedAt ? "Arquivada · " : ""}{TYPE_LABELS[category.type]}</span>
                  </span>
                  <span className={styles.sourceAmounts}>
                    {hasPrice && allocatedCents > 0 ? (
                      <span className={styles.amountFlow}>
                        <PrivateAmount amountCents={category.amountCents} />
                        <ArrowRight aria-hidden="true" size={14} />
                        <PrivateAmount amountCents={remainingCents} />
                      </span>
                    ) : (
                      <PrivateAmount amountCents={category.amountCents} />
                    )}
                    <span className={styles.sourceState}>
                      {!selected
                        ? "Intacto"
                        : allocatedCents > 0
                          ? <><PrivateAmount amountCents={allocatedCents} /> usados</>
                          : "Disponível se for preciso"}
                    </span>
                  </span>
                  <span className={styles.balanceTrack} aria-hidden="true">
                    <span
                      style={{
                        background: category.color,
                        transform: `scaleX(${remainingRatio})`,
                      }}
                    />
                  </span>
                </label>
              );
            })}
          </fieldset>
        </section>

        <aside className={styles.resultPanel} id="purchase-result" aria-labelledby="result-heading">
          <div className={styles.resultStatus} data-state={price.error ? "error" : isCovered ? "covered" : "pending"}>
            <span className={styles.statusIcon} aria-hidden="true">
              {price.error || (hasPrice && !isCovered) ? (
                <CircleAlert size={18} />
              ) : isCovered ? (
                <Check size={18} />
              ) : (
                <Sparkles size={18} />
              )}
            </span>
            <div aria-live="polite" aria-atomic="true">
              <p className={styles.stepLabel}>02 · Resultado</p>
              <h2 id="result-heading">{resultTitle}</h2>
            </div>
          </div>

          <div className={styles.resultHero}>
            <span>{isCovered ? "Património depois" : hasPrice ? "Coberto até agora" : "Património atual"}</span>
            <PrivateAmount
              amountCents={isCovered ? currentTotalCents - price.cents : simulation.remainingTotalCents}
              className={styles.resultAmount}
            />
            {description.trim() && hasPrice ? <p>depois de “{description.trim()}”</p> : null}
          </div>

          <div className={styles.comparison} aria-label="Composição do património antes e depois da simulação">
            <div className={styles.comparisonRow}>
              <span>Agora</span>
              <div className={styles.compositionBar} aria-hidden="true">
                {sources.map((category) => (
                  <i
                    key={category.id}
                    style={{
                      background: category.color,
                      width: `${currentTotalCents > 0 ? (category.amountCents / currentTotalCents) * 100 : 0}%`,
                    }}
                  />
                ))}
              </div>
              <PrivateAmount amountCents={currentTotalCents} />
            </div>
            <div className={styles.comparisonRow}>
              <span>{isCovered ? "Depois" : "Parcial"}</span>
              <div className={styles.compositionBar} aria-hidden="true">
                {sources.map((category) => {
                  const allocatedCents = allocationById.get(category.id)?.allocatedCents ?? 0;
                  const remainingCents = category.amountCents - allocatedCents;
                  return (
                    <i
                      key={category.id}
                      style={{
                        background: category.color,
                        width: `${currentTotalCents > 0 ? (remainingCents / currentTotalCents) * 100 : 0}%`,
                      }}
                    />
                  );
                })}
              </div>
              <PrivateAmount amountCents={simulation.remainingTotalCents} />
            </div>
          </div>

          <dl className={styles.resultDetails}>
            <div>
              <dt>Preço da compra</dt>
              <dd>{hasPrice ? <PrivateAmount amountCents={price.cents} /> : "—"}</dd>
            </div>
            <div>
              <dt>Sobra nas fontes escolhidas</dt>
              <dd><PrivateAmount amountCents={selectedRemainingCents} /></dd>
            </div>
            <div>
              <dt>Capital protegido</dt>
              <dd><PrivateAmount amountCents={simulation.protectedTotalCents} /></dd>
            </div>
            <div>
              <dt>Impacto no património</dt>
              <dd>{hasPrice && !isPrivacyMode ? formatPercent(impact) : hasPrice ? "••••" : "—"}</dd>
            </div>
          </dl>

          {hasPrice && !isCovered ? (
            <p className={styles.guidance}>
              <ShieldCheck aria-hidden="true" size={17} />
              Escolhe mais uma fonte para cobrir o que falta. Nada é usado sem a tua seleção.
            </p>
          ) : hasPrice && untouchedNames.length > 0 ? (
            <p className={styles.guidance}>
              <ShieldCheck aria-hidden="true" size={17} />
              {untouchedNames.length === 1
                ? `${untouchedNames[0]} fica intacto.`
                : `${untouchedNames.slice(0, -1).join(", ")} e ${untouchedNames.at(-1)} ficam intactos.`}
            </p>
          ) : (
            <p className={styles.guidance}>
              <ShieldCheck aria-hidden="true" size={17} />
              Começamos apenas pelo capital disponível. Tu decides quando tocar no resto.
            </p>
          )}

          <div className={styles.resultFooter}>
            <button className={styles.resetButton} onClick={reset} type="button">
              <RotateCcw aria-hidden="true" size={14} /> Recomeçar
            </button>
            <p>
              Com base no registo de {formatDate(snapshotDate)}. Assume que a compra sai do património e não entra como um novo ativo. Nada é guardado.
            </p>
          </div>
        </aside>
      </div>

      {hasPrice ? (
        <a className={styles.mobileResult} href="#purchase-result">
          <span>{isCovered ? "Compra coberta" : "Ainda falta"}</span>
          <strong>
            {isCovered ? (
              <PrivateAmount amountCents={currentTotalCents - price.cents} />
            ) : (
              <PrivateAmount amountCents={simulation.shortfallCents} />
            )}
          </strong>
        </a>
      ) : null}
    </main>
  );
}

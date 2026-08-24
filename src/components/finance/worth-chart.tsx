"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { usePrivacy } from "@/components/shell/privacy-provider";
import { PrivateAmount } from "@/components/ui/private-amount";
import {
  aggregateChartPoints,
  areaPath,
  calculateChartDomain,
  calculateChartStats,
  chartCoordinates,
  defaultChartCategoryIds,
  filterChartPoints,
  filterPreviousChartPoints,
  linePath,
  type ChartRange,
} from "@/lib/domain/chart";
import { formatDate } from "@/lib/domain/dates";
import { formatCompactCurrency, formatCurrency, formatPercent } from "@/lib/domain/money";
import type { Category, CategoryType, ChartPoint } from "@/lib/domain/types";
import styles from "./finance.module.css";

const RANGES: { value: ChartRange; label: string }[] = [
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1A" },
  { value: "ALL", label: "Tudo" },
];

const TYPE_LABELS: Record<CategoryType, string> = {
  available: "Disponível",
  reserved: "Reservado",
  investment: "Investimento",
  asset: "Ativo",
  savings: "Poupança",
  other: "Outro",
};

export function WorthChart({
  categories,
  points,
}: {
  categories: Category[];
  points: ChartPoint[];
}) {
  const [range, setRange] = useState<ChartRange>("ALL");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [plotWidth, setPlotWidth] = useState(1000);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(() =>
    defaultChartCategoryIds(categories),
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const { isPrivacyMode } = usePrivacy();
  const defaultCategoryIds = useMemo(() => defaultChartCategoryIds(categories), [categories]);
  const selectedCategorySet = useMemo(() => new Set(selectedCategoryIds), [selectedCategoryIds]);
  const selectedCategories = useMemo(
    () => categories.filter((category) => selectedCategorySet.has(category.id)),
    [categories, selectedCategorySet],
  );
  const selectedPoints = useMemo(
    () => aggregateChartPoints(points, selectedCategoryIds),
    [points, selectedCategoryIds],
  );
  const visible = useMemo(
    () => selectedCategoryIds.length === 0 ? [] : filterChartPoints(selectedPoints, range),
    [range, selectedCategoryIds.length, selectedPoints],
  );
  const coordinates = useMemo(() => chartCoordinates(visible, plotWidth), [plotWidth, visible]);
  const stats = useMemo(() => calculateChartStats(visible), [visible]);
  const domain = useMemo(() => calculateChartDomain(visible), [visible]);
  const previous = useMemo(
    () => selectedCategoryIds.length === 0 ? [] : filterPreviousChartPoints(selectedPoints, range),
    [range, selectedCategoryIds.length, selectedPoints],
  );
  const previousStats = useMemo(() => calculateChartStats(previous), [previous]);
  const active = activeIndex === null ? null : coordinates[activeIndex];
  const hasChart = coordinates.length > 0;
  const allSelected = selectedCategoryIds.length === categories.length;
  const defaultSelected =
    selectedCategoryIds.length === defaultCategoryIds.length &&
    defaultCategoryIds.every((id) => selectedCategorySet.has(id));
  const selectionLabel =
    selectedCategories.length === 0
      ? "Selecionar"
      : allSelected
        ? "Todas"
        : selectedCategories.length === 1
          ? selectedCategories[0].name
          : `${selectedCategories.length} categorias`;
  const selectionDescription = selectedCategories.map((category) => category.name).join(", ");
  const tooltipEdge = active
    ? active.x < 140
      ? "start"
      : plotWidth - active.x < 140
        ? "end"
        : "center"
    : "center";

  useEffect(() => {
    if (!filterOpen) return;
    const closeFromOutside = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !filterRef.current?.contains(event.target)) {
        setFilterOpen(false);
      }
    };
    const closeFromEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setFilterOpen(false);
      filterButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, [filterOpen]);

  useEffect(() => {
    if (!hasChart) return;
    const element = canvasRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const updateWidth = (width: number) => {
      const next = Math.max(240, Math.round(width));
      setPlotWidth((current) => (current === next ? current : next));
    };
    updateWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) updateWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasChart]);

  const selectPointer = (event: PointerEvent<SVGRectElement>) => {
    if (coordinates.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setActiveIndex(Math.round(ratio * (coordinates.length - 1)));
  };

  const handleKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (coordinates.length === 0) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      const current = activeIndex ?? coordinates.length - 1;
      setActiveIndex(Math.min(coordinates.length - 1, Math.max(0, current + direction)));
    }
    if (event.key === "Escape") setActiveIndex(null);
  };

  const changeSelection = (next: string[]) => {
    setSelectedCategoryIds(next);
    setActiveIndex(null);
  };

  const toggleCategory = (categoryId: string) => {
    changeSelection(
      selectedCategorySet.has(categoryId)
        ? selectedCategoryIds.filter((id) => id !== categoryId)
        : [...selectedCategoryIds, categoryId],
    );
  };

  const yLabels = [
    Math.round(domain.maxCents),
    Math.round((domain.minCents + domain.maxCents) / 2),
  ];

  return (
    <section className={styles.chartSection} aria-labelledby="worth-chart-heading">
      <div className={styles.chartHeader}>
        <div>
          <h2 className={styles.sectionHeading} id="worth-chart-heading">Evolução</h2>
          {visible.length > 1 ? (
            <p className={styles.chartSummary}>
              <strong>
                Atual <PrivateAmount amountCents={visible.at(-1)!.totalCents} />
              </strong>
              {" · "}
              <strong className={stats.growthCents >= 0 ? styles.positive : styles.negative}>
                <PrivateAmount amountCents={stats.growthCents} showSign />
              </strong>
              {stats.growthPercentage !== null ? ` · ${formatPercent(stats.growthPercentage, 0)} no período` : ""}
              {previous.length > 1 ? <>{" · período anterior "}<PrivateAmount amountCents={previousStats.growthCents} showSign /></> : null}
              {" · mínimo "}<PrivateAmount amountCents={stats.minCents} />
              {" · máximo "}<PrivateAmount amountCents={stats.maxCents} />
            </p>
          ) : visible.length === 1 ? (
            <p className={styles.chartSummary}>
              <strong>
                Atual <PrivateAmount amountCents={visible[0].totalCents} />
              </strong>
              {" · ainda não há registos suficientes neste período."}
            </p>
          ) : (
            <p className={styles.chartSummary}>Seleciona pelo menos uma categoria.</p>
          )}
        </div>
        <div className={styles.chartControls}>
          <div className={styles.chartCategoryFilter} ref={filterRef}>
            <button
              aria-controls="worth-chart-category-filter"
              aria-expanded={filterOpen}
              aria-label={`Categorias no gráfico: ${selectionDescription || "nenhuma"}`}
              className={styles.chartFilterButton}
              onClick={() => setFilterOpen((open) => !open)}
              ref={filterButtonRef}
              type="button"
            >
              <SlidersHorizontal aria-hidden="true" size={15} />
              <span>{selectionLabel}</span>
              <ChevronDown aria-hidden="true" data-open={filterOpen} size={14} />
            </button>
            {filterOpen ? (
              <div
                aria-labelledby="worth-chart-filter-heading"
                className={styles.chartFilterPopover}
                id="worth-chart-category-filter"
                role="group"
              >
                <div className={styles.chartFilterHeading}>
                  <div>
                    <strong id="worth-chart-filter-heading">Montante no gráfico</strong>
                    <span>A linha soma apenas as categorias selecionadas.</span>
                  </div>
                  <PrivateAmount
                    amountCents={selectedPoints.at(-1)?.totalCents ?? 0}
                    className={styles.chartFilterTotal}
                  />
                </div>
                <div className={styles.chartFilterList}>
                  {categories.map((category) => (
                    <label className={styles.chartFilterOption} key={category.id}>
                      <input
                        checked={selectedCategorySet.has(category.id)}
                        onChange={() => toggleCategory(category.id)}
                        type="checkbox"
                      />
                      <span className={styles.chartFilterDot} style={{ background: category.color }} />
                      <span className={styles.chartFilterName}>
                        {category.name}
                        <small>
                          {TYPE_LABELS[category.type]}
                          {category.archivedAt ? " · Arquivada" : ""}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
                <div className={styles.chartFilterActions}>
                  <button
                    disabled={allSelected}
                    onClick={() => changeSelection(categories.map((category) => category.id))}
                    type="button"
                  >
                    Todas
                  </button>
                  <button
                    disabled={defaultSelected}
                    onClick={() => changeSelection(defaultCategoryIds)}
                    type="button"
                  >
                    Repor padrão
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className={styles.rangeSelector} aria-label="Período do gráfico" role="group">
            {RANGES.map((item) => (
              <button
                className={styles.rangeButton}
                aria-pressed={range === item.value}
                data-active={range === item.value}
                key={item.value}
                onClick={() => {
                  setRange(item.value);
                  setActiveIndex(null);
                }}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!hasChart ? (
        <div className={styles.emptyChart}>
          {selectedCategoryIds.length === 0
            ? "Seleciona pelo menos uma categoria para desenhar a evolução."
            : "Cria o primeiro snapshot para começar a ver a evolução."}
        </div>
      ) : (
        <div
          ref={canvasRef}
          className={styles.chartCanvas}
          role="group"
          aria-label={
            isPrivacyMode
              ? `Gráfico da evolução de ${selectionLabel}, valores ocultos`
              : `Gráfico da evolução de ${selectionDescription} entre ${formatDate(visible[0].date)} e ${formatDate(visible.at(-1)!.date)}`
          }
          aria-describedby="worth-chart-instructions"
          tabIndex={0}
          onKeyDown={handleKeyboard}
        >
          <svg className={styles.chartSvg} viewBox={`0 0 ${plotWidth} 280`} aria-hidden="true">
            {[18, 135, 252].map((y) => (
              <line className={styles.chartGrid} key={y} x1="12" x2={plotWidth - 12} y1={y} y2={y} />
            ))}
            {yLabels.map((value, index) => (
              <text className={styles.chartAxisLabel} key={`${value}-${index}`} x="16" y={[14, 131][index]}>
                {isPrivacyMode ? "••••" : formatCompactCurrency(value)}
              </text>
            ))}
            {coordinates.length > 1 && <path className={styles.chartArea} d={areaPath(coordinates)} />}
            <path className={styles.chartLine} d={linePath(coordinates)} />
            {coordinates.length === 1 ? (
              <circle
                className={styles.chartPoint}
                cx={coordinates[0].x}
                cy={coordinates[0].y}
                r="5"
              />
            ) : null}
            {coordinates.filter((point) => point.note).map((point) => (
              <polygon
                className={styles.notePoint}
                key={`note-${point.id}`}
                points={`${point.x},${point.y - 6} ${point.x + 5},${point.y - 1} ${point.x},${point.y + 4} ${point.x - 5},${point.y - 1}`}
              />
            ))}
            {active && (
              <>
                <line className={styles.chartCrosshair} x1={active.x} x2={active.x} y1="18" y2="252" />
                <circle className={styles.chartPoint} cx={active.x} cy={active.y} r="5" />
              </>
            )}
            <text className={styles.chartAxisLabel} x="12" y="276">{formatDate(visible[0].date)}</text>
            <text className={styles.chartAxisLabel} x={plotWidth - 12} y="276" textAnchor="end">
              {formatDate(visible.at(-1)!.date)}
            </text>
            <rect
              className={styles.chartHitArea}
              x="0"
              y="0"
              width={plotWidth}
              height="270"
              onPointerDown={selectPointer}
              onPointerMove={selectPointer}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") setActiveIndex(null);
              }}
            />
          </svg>
          {active && (
            <div
              className={styles.chartTooltip}
              data-edge={tooltipEdge}
              style={{ left: `${(active.x / plotWidth) * 100}%`, top: `${(active.y / 280) * 100}%` }}
            >
              <span className={styles.chartTooltipDate}>{formatDate(active.date, "long")}</span>
              <PrivateAmount className={styles.chartTooltipValue} amountCents={active.totalCents} />
              <span className={styles.chartTooltipSelection}>{selectionLabel}</span>
              {active.note && <span className={styles.chartTooltipNote}>{active.note}</span>}
            </div>
          )}
          <p className={styles.screenReaderOnly} id="worth-chart-instructions">
            Usa as setas esquerda e direita para percorrer os registos do gráfico. Prima Escape para limpar a seleção.
          </p>
          <p className={styles.screenReaderOnly} aria-atomic="true" aria-live="polite">
            {active ? (
              <>
                {formatDate(active.date, "long")}. Montante selecionado: <PrivateAmount amountCents={active.totalCents} />.
                {active.note ? ` Nota: ${active.note}.` : ""}
              </>
            ) : null}
          </p>
          <table className={styles.screenReaderOnly} aria-hidden={isPrivacyMode}>
            <caption>Evolução de {selectionDescription}</caption>
            <thead><tr><th scope="col">Data</th><th scope="col">Montante selecionado</th><th scope="col">Nota</th></tr></thead>
            <tbody>
              {visible.map((point) => (
                <tr key={point.id}>
                  <td>{formatDate(point.date)}</td>
                  <td>{formatCurrency(point.totalCents, false)}</td>
                  <td>{point.note ?? "Sem nota"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

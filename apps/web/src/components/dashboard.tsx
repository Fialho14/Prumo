import { Eye, EyeOff, Plus } from "lucide-react";
import { useId, useMemo, useState } from "react";
import {
  areaPath,
  calculateChartStats,
  chartCoordinates,
  filterChartPoints,
  linePath,
  type ChartRange,
} from "@/lib/domain/chart";
import { formatCurrency, formatSignedCurrency } from "@/lib/domain/money";
import { portfolioToDashboardData, type WebPortfolio } from "../lib";

const RANGE_OPTIONS: Array<{ value: ChartRange; label: string }> = [
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1Y" },
  { value: "ALL", label: "All" },
];

function englishDate(date: string, style: "short" | "long" = "short") {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: style === "long" ? "long" : "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function Amount({ cents, privateMode, signed = false }: { cents: number; privateMode: boolean; signed?: boolean }) {
  return (
    <span className={privateMode ? "private-value" : undefined}>
      {privateMode ? "•••••" : signed ? formatSignedCurrency(cents) : formatCurrency(cents)}
    </span>
  );
}

function WorthChart({ portfolio, range, privateMode }: { portfolio: WebPortfolio; range: ChartRange; privateMode: boolean }) {
  const gradientId = useId().replace(/:/g, "");
  const data = useMemo(() => portfolioToDashboardData(portfolio), [portfolio]);
  const points = useMemo(() => filterChartPoints(data.chart, range), [data.chart, range]);
  const coordinates = chartCoordinates(points, 1000, 310, { top: 22, right: 18, bottom: 46, left: 18 });
  const stats = calculateChartStats(points);
  const path = linePath(coordinates);
  const area = areaPath(coordinates, 264);
  const first = points[0];
  const last = points.at(-1);

  return (
    <div>
      <div className="chart-toolbar__summary">
        <span className="dashboard__label">Change in this period</span>
        <strong className={stats.growthCents < 0 ? "text-negative" : "text-positive"}>
          <Amount cents={stats.growthCents} privateMode={privateMode} signed />
        </strong>
      </div>
      <svg
        className="worth-chart"
        viewBox="0 0 1000 310"
        role="img"
        aria-label={privateMode ? "Net worth history hidden by Privacy Mode" : `Net worth history from ${first ? englishDate(first.date) : "the first snapshot"} to ${last ? englishDate(last.date) : "the latest snapshot"}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity=".22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[70, 142, 214].map((y) => (
          <line className="worth-chart__grid" key={y} x1="18" x2="982" y1={y} y2={y} />
        ))}
        {coordinates.length > 1 ? <path d={area} fill={`url(#${gradientId})`} /> : null}
        <path className="worth-chart__line" d={path} />
        {coordinates.map((point, index) => (
          index === coordinates.length - 1 || point.note ? (
            <circle className="worth-chart__point" key={point.id} cx={point.x} cy={point.y} r={index === coordinates.length - 1 ? 5 : 3.5} />
          ) : null
        ))}
        {first ? <text x="18" y="300">{englishDate(first.date)}</text> : null}
        {last ? <text x="982" y="300" textAnchor="end">{englishDate(last.date)}</text> : null}
      </svg>
    </div>
  );
}

export function Dashboard({
  portfolio,
  embedded = false,
  privateMode = false,
  onTogglePrivacy,
  onUpdate,
}: {
  portfolio: WebPortfolio;
  embedded?: boolean;
  privateMode?: boolean;
  onTogglePrivacy?: () => void;
  onUpdate?: () => void;
}) {
  const [range, setRange] = useState<ChartRange>("1Y");
  const data = useMemo(() => portfolioToDashboardData(portfolio), [portfolio]);

  if (!data.latest) {
    return (
      <section className={["dashboard", embedded ? "dashboard--embedded" : ""].join(" ")}>
        <div className="empty-dashboard">
          <div>
            <p className="eyebrow">Your first reference point</p>
            <h1>Know where you stand.</h1>
            <p>Add the amounts you have today. Prumo will turn each update into a clear history.</p>
            {onUpdate ? (
              <button className="button button--primary" type="button" onClick={onUpdate}>
                <Plus size={16} aria-hidden="true" /> Add first snapshot
              </button>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  const visibleCategories = data.categories.filter((category) => category.amountCents > 0);
  const latestHistory = portfolio.snapshots.slice(-5).reverse();
  const isExample = portfolio.mode !== "personal";

  return (
    <section className={["dashboard", embedded ? "dashboard--embedded" : ""].join(" ")} aria-label="Prumo net worth dashboard">
      {isExample ? (
        <div className="dashboard__banner">
          <span><strong>{portfolio.mode === "demo" ? "Demo data" : "Template data"}</strong> · Every name, value and note shown here is fictitious.</span>
          <span aria-hidden="true">Example only</span>
        </div>
      ) : null}
      <div className="dashboard__hero">
        <div className="dashboard__worth">
          <span className="dashboard__label">Net worth · {englishDate(data.latest.date)}</span>
          <div className="dashboard__total">
            <Amount cents={data.stats.totalCents} privateMode={privateMode} />
          </div>
          <p className="dashboard__delta">
            <strong className={data.stats.deltaCents < 0 ? "text-negative" : undefined}>
              <Amount cents={data.stats.deltaCents} privateMode={privateMode} signed />
            </strong>
            <span>since the previous snapshot</span>
          </p>
          {onUpdate ? (
            <button className="button button--primary" type="button" onClick={onUpdate}>
              <Plus size={16} aria-hidden="true" /> Update snapshot
            </button>
          ) : (
            <a className="button button--primary" href="/app/">
              Open this demo
            </a>
          )}
        </div>

        <div className="dashboard__distribution">
          <div className="dashboard__section-title">
            <h2>Where it is</h2>
            {onTogglePrivacy ? (
              <button
                className="icon-button"
                type="button"
                aria-label={privateMode ? "Show financial values" : "Hide financial values"}
                aria-pressed={privateMode}
                onClick={onTogglePrivacy}
              >
                {privateMode ? <Eye size={17} aria-hidden="true" /> : <EyeOff size={17} aria-hidden="true" />}
              </button>
            ) : <span>Latest snapshot</span>}
          </div>
          <div className="allocation-bar" role="img" aria-label="Distribution across categories">
            {visibleCategories.map((category) => (
              <span
                key={category.id}
                title={category.name}
                style={{ backgroundColor: category.color, width: `${Math.max(category.percentage * 100, 0.5)}%` }}
              />
            ))}
          </div>
          <ul className="category-list">
            {visibleCategories.map((category) => (
              <li key={category.id}>
                <span className="category-list__identity">
                  <span className="category-list__dot" style={{ backgroundColor: category.color }} aria-hidden="true" />
                  <span className="category-list__name">
                    {category.name}
                    <small className="category-list__meta">{new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 1 }).format(category.percentage)}</small>
                  </span>
                </span>
                <strong className="category-list__amount"><Amount cents={category.amountCents} privateMode={privateMode} /></strong>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="dashboard__chart">
        <div className="chart-toolbar">
          <div className="dashboard__section-title">
            <h2>How it changed</h2>
          </div>
          <div className="range-picker" role="group" aria-label="Chart range">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={range === option.value}
                onClick={() => setRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <WorthChart portfolio={portfolio} range={range} privateMode={privateMode} />
      </div>

      <div className="dashboard__history">
        <div className="dashboard__section-title">
          <h2>Recent snapshots</h2>
          <span>{portfolio.snapshots.length} total</span>
        </div>
        <ol className="history-list">
          {latestHistory.map((snapshot) => (
            <li key={snapshot.id}>
              <time dateTime={snapshot.date}>{englishDate(snapshot.date)}</time>
              <span>{snapshot.note || "No note"}</span>
              <strong><Amount cents={snapshot.totalCents} privateMode={privateMode} /></strong>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

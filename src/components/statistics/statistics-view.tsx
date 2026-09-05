"use client";
import { Select } from "@/components/ui/select";
import { useCallback, useEffect } from "react";
import { useAutoFilters } from "@/components/shared/use-auto-filters";
import { statisticsQuery } from "@/lib/filters";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Coins,
  Clock3,
  BookOpen,
  ChartNoAxesCombined,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "@/components/ui/toaster";
import type {
  StatisticsResult,
  StatisticsMetric,
} from "@/features/statistics/service";
import type { Profile } from "@/types";
const metrics = [
  { key: "earnings", label: "Заработок", unit: "₽", icon: Coins },
  { key: "hours", label: "Часы", unit: "ч", icon: Clock3 },
  { key: "lessons", label: "Занятия", unit: "", icon: BookOpen },
] as const;
export function StatisticsView({
  data,
  period,
  tutors,
  error,
}: {
  data: StatisticsResult;
  period: string;
  tutors?: Profile[];
  error?: string;
}) {
  useEffect(() => { if (error) toast.error(error); }, [error]);
  const parse = useCallback((params: URLSearchParams) => ({
    period: params.get("period") ?? "7", tutor: tutors ? params.get("tutor") ?? "" : "",
    metric: params.get("metric") ?? "earnings", from: params.get("from") ?? data.query.from, to: params.get("to") ?? data.query.to,
  }), [tutors, data.query.from, data.query.to]);
  const { filters, change, pending } = useAutoFilters({
    period, tutor: tutors ? data.query.tutorId ?? "" : "", metric: data.query.metric,
    from: data.query.from, to: data.query.to,
  }, parse, statisticsQuery);
  const custom = filters.period === "custom";
  const invalidDates = custom && statisticsQuery(filters) === null;
  const metric = metrics.find((m) => m.key === data.query.metric)!;
  return (
    <div className="statistics-view" aria-busy={pending}>
      <div className="statistics-controls">
        <div className="period-tabs">
          {["7", "14", "30"].map((p) => (
            <label key={p}>
              <input
                type="radio"
                name="period"
                value={p}
                checked={filters.period === p}
                onChange={() => change({ period: p })}
              />
              <span>{p} дней</span>
            </label>
          ))}
          <label>
            <input
              type="radio"
              name="period"
              value="custom"
              checked={custom}
              onChange={() => change({ period: "custom", from: data.query.from, to: data.query.to })}
            />
            <span>
              <SlidersHorizontal size={13} />
              Свой период
            </span>
          </label>
        </div>
        {tutors && (
          <Select searchable
            name="tutor"
            aria-label="Репетитор для статистики"
            value={filters.tutor}
            onValueChange={tutor => change({ tutor })}
          >
            <option value="">Общая статистика</option>
            {tutors.map((t) => (
              <option value={t.id} key={t.id}>
                {t.full_name}
              </option>
            ))}
          </Select>
        )}
        <Select
          name="metric"
          aria-label="Показатель"
          value={filters.metric}
          onValueChange={metric => change({ metric })}
        >
          {metrics.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </Select>
        {custom && (
          <div className="custom-dates">
            <label>
              Дата от
              <input
                type="date"
                name="from"
                value={filters.from}
                aria-invalid={invalidDates}
                aria-describedby={invalidDates ? "statistics-date-error" : undefined}
                onChange={event => change({ from: event.target.value })}
                required
              />
            </label>
            <span>—</span>
            <label>
              Дата до
              <input
                type="date"
                name="to"
                value={filters.to}
                aria-invalid={invalidDates}
                aria-describedby={invalidDates ? "statistics-date-error" : undefined}
                onChange={event => change({ to: event.target.value })}
                required
              />
            </label>
          </div>
        )}
      </div>
      {invalidDates && <p className="field-error" id="statistics-date-error" role="status">Укажите обе даты; начало должно быть не позже окончания.</p>}
      <div className={`kpi-grid ${pending ? "loading-dim" : ""}`}>
        {metrics.map(({ key, label, unit, icon: Icon }) => (
          <section
            key={key}
            className={`panel kpi-card ${data.query.metric === key ? "selected" : ""}`}
          >
            <div>
              <span>{label}</span>
              <Icon size={16} />
            </div>
            <strong>
              {data.totals[key as StatisticsMetric].toLocaleString("ru-RU")}
              <span>{unit}</span>
            </strong>
            <small>За выбранный период</small>
          </section>
        ))}
      </div>
      <section className={`panel chart-panel ${pending ? "loading-dim" : ""}`}>
        <div className="chart-header">
          <div>
            <h2>{metric.label}</h2>
            <p>
              {data.query.from.split("-").reverse().join(".")} —{" "}
              {data.query.to.split("-").reverse().join(".")}
            </p>
          </div>
          <span className="chart-legend">
            <i />
            {metric.label}
          </span>
        </div>
        <div className="chart-area">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart
              data={data.points}
              margin={{ top: 15, right: 16, left: -25, bottom: 0 }}
            >
              <CartesianGrid stroke="rgba(244,224,203,.06)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "#a8998b", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "#a8998b", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                domain={data.points.length ? ["auto", "auto"] : [0, 4]}
              />
              <Tooltip
                contentStyle={{
                  background: "#251e18",
                  border: "1px solid #463a2e",
                  borderRadius: 8,
                  color: "#f2e8dc",
                }}
                formatter={(value) => [`${Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${metric.unit}`, metric.label]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#d39a59"
                fill="#d39a59"
                fillOpacity={0.08}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
          {!data.points.length && (
            <div className="chart-empty">
              <span className="empty-icon">
                <ChartNoAxesCombined size={23} strokeWidth={1.4} />
              </span>
              <h3>Нет данных за выбранный период</h3>
              <p>Отметьте проведённые занятия в расписании.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

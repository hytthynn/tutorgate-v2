"use client";
import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
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
import { Button } from "@/components/ui/button";
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
  const router = useRouter();
  const path = usePathname();
  const [pending, startTransition] = useTransition();
  const [custom, setCustom] = useState(period === "custom");
  function submit(form: FormData) {
    const query = new URLSearchParams();
    for (const [key, value] of form)
      if (typeof value === "string" && value) query.set(key, value);
    startTransition(() => router.push(`${path}?${query}`));
  }
  const metric = metrics.find((m) => m.key === data.query.metric)!;
  return (
    <div className="statistics-view" aria-busy={pending}>
      <form action={submit} className="statistics-controls">
        <div className="period-tabs">
          {["7", "14", "30"].map((p) => (
            <label key={p}>
              <input
                type="radio"
                name="period"
                value={p}
                defaultChecked={period === p}
                onChange={() => setCustom(false)}
              />
              <span>{p} дней</span>
            </label>
          ))}
          <label>
            <input
              type="radio"
              name="period"
              value="custom"
              defaultChecked={period === "custom"}
              onChange={() => setCustom(true)}
            />
            <span>
              <SlidersHorizontal size={13} />
              Свой период
            </span>
          </label>
        </div>
        {tutors && (
          <select
            name="tutor"
            aria-label="Репетитор для статистики"
            defaultValue={data.query.tutorId ?? ""}
          >
            <option value="">Общая статистика</option>
            {tutors.map((t) => (
              <option value={t.id} key={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>
        )}
        <select
          name="metric"
          aria-label="Показатель"
          defaultValue={data.query.metric}
        >
          {metrics.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <Button variant="secondary" type="submit" disabled={pending}>
          {pending ? "Загрузка…" : "Применить"}
        </Button>
        {custom && (
          <div className="custom-dates">
            <label>
              Дата от
              <input
                type="date"
                name="from"
                defaultValue={data.query.from}
                required
              />
            </label>
            <span>—</span>
            <label>
              Дата до
              <input
                type="date"
                name="to"
                defaultValue={data.query.to}
                required
              />
            </label>
          </div>
        )}
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="kpi-grid">
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
                formatter={(value) => [`${value} ${metric.unit}`, metric.label]}
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
              <p>Статистика появится после запуска расписания.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { BarChart3 } from "lucide-react";

interface PayoutData {
  id: string;
  amount: number;
  status: string;
  created_at: string;
}

interface EarningsChartProps {
  payouts: PayoutData[];
  timeFilter: string;
}

export function EarningsChart({ payouts, timeFilter }: EarningsChartProps) {
  const chartData = useMemo(() => {
    if (payouts.length === 0) return [];

    // Group payouts by date based on filter
    const groupedData: { [key: string]: number } = {};

    payouts.forEach((payout) => {
      const date = new Date(payout.created_at);
      let key: string;

      if (timeFilter === "30") {
        // Daily for 30 days
        key = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      } else if (timeFilter === "90") {
        // Weekly for 90 days
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      } else {
        // Monthly for year/all time
        key = date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      }

      groupedData[key] = (groupedData[key] || 0) + payout.amount;
    });

    return Object.entries(groupedData)
      .map(([date, amount]) => ({ date, amount }))
      .reverse();
  }, [payouts, timeFilter]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
        <BarChart3 className="w-12 h-12 mb-4" />
        <p>No earnings data available</p>
      </div>
    );
  }

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            className="text-xs"
            tick={{ fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            className="text-xs"
            tick={{ fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip
            formatter={(value: number) => [formatCurrency(value), "Earnings"]}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#colorEarnings)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

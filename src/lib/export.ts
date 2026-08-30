/**
 * Export data to CSV file and trigger download
 */
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  columns?: { key: keyof T; header: string }[]
): void {
  if (data.length === 0) return;

  // Determine columns from first row if not specified
  const cols = columns || Object.keys(data[0]).map((key) => ({ key: key as keyof T, header: key as string }));

  // Build CSV header
  const headers = cols.map((c) => `"${String(c.header)}"`).join(",");

  // Build CSV rows
  const rows = data.map((row) =>
    cols
      .map((col) => {
        const value = row[col.key];
        // Handle different data types
        if (value === null || value === undefined) return '""';
        if (typeof value === "string") return `"${value.replace(/"/g, '""')}"`;
        if (typeof value === "number") return String(value);
        if (typeof value === "boolean") return String(value);
        if (typeof value === "object" && value !== null) {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        }
        return `"${String(value)}"`;
      })
      .join(",")
  );

  // Combine into CSV content
  const csvContent = [headers, ...rows].join("\n");

  // Create blob and download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format a date for CSV export
 */
export function formatDateForExport(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format currency for CSV export
 */
export function formatCurrencyForExport(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

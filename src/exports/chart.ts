import QuickChart from "quickchart-js";
import type { MonthlyDataPoint } from "../shared/types.js";

/**
 * Generate a line chart image (PNG buffer) for monthly complaint rates.
 * Uses QuickChart API for server-side chart rendering.
 */
export async function generateTrendChart(
  series: MonthlyDataPoint[],
  meanValue: number,
  uclValue: number
): Promise<Buffer> {
  const labels = series.map((dp) => dp.period);
  const rates = series.map((dp) => dp.rate);

  const chart = new QuickChart();
  chart.setConfig({
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Complaint Rate (per 1,000 units)",
          data: rates,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.1)",
          fill: true,
          tension: 0.2,
          pointRadius: 4,
        },
        {
          label: `Mean (${meanValue.toFixed(4)})`,
          data: Array(labels.length).fill(meanValue),
          borderColor: "#059669",
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
        },
        {
          label: `UCL 3σ (${uclValue.toFixed(4)})`,
          data: Array(labels.length).fill(uclValue),
          borderColor: "#dc2626",
          borderDash: [10, 5],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      title: {
        display: true,
        text: "Monthly Complaint Rate Trend Analysis",
        fontSize: 16,
      },
      scales: {
        xAxes: [
          {
            display: true,
            scaleLabel: { display: true, labelString: "Period (YYYY-MM)" },
          },
        ],
        yAxes: [
          {
            display: true,
            scaleLabel: {
              display: true,
              labelString: "Complaint Rate per 1,000 Units",
            },
          },
        ],
      },
      legend: { position: "bottom" },
    },
  });

  chart.setWidth(800);
  chart.setHeight(400);
  chart.setBackgroundColor("#ffffff");

  const buffer = await chart.toBinary();
  return Buffer.from(buffer);
}

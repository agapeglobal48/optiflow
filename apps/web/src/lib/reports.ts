import { api } from "./api";
import type { OverviewReport } from "@/types/reports";

export async function fetchOverview(): Promise<OverviewReport> {
  const response = await api.get<OverviewReport>("/reports/overview");
  return response.data;
}

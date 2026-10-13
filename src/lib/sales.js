import { api } from "./client-api.js";

// range: "today" or "all". Managers get everyone's sales, cashiers get their own.
export const getSales = (range = "today") => api(`/api/sales?range=${range}`);

export function summarize(list) {
  let count = 0, total = 0, cash = 0, momo = 0;
  for (const s of list) {
    count++;
    total += s.total;
    if (s.method === "cash") cash += s.total;
    else momo += s.total;
  }
  return { count, total, cash, momo };
}
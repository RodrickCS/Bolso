import { z } from "zod";
import { hojeISO } from "../servicos/texto.js";

export const parametroMes = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "use o formato AAAA-MM")
  .default(() => hojeISO().slice(0, 7));

// "2026-10" -> { inicio: 2026-10-01, fim: 2026-11-01 } (fim exclusivo)
export function intervaloDoMes(mes) {
  const [ano, numero] = mes.split("-").map(Number);
  return { inicio: new Date(Date.UTC(ano, numero - 1, 1)), fim: new Date(Date.UTC(ano, numero, 1)) };
}

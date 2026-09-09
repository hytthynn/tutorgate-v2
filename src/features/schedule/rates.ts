import { z } from "zod";
export const billingRateSchema=z.number().finite().min(0).max(1000000).refine(n=>Number(n.toFixed(2))===n,"Ставка должна содержать не более двух знаков после запятой.");
export const effectiveRate=(pair:number|null,tutor:number|null,global:number)=>pair??tutor??global;

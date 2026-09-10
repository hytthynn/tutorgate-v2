import {z} from "zod";
export const defaultPackages=["amsmath","amssymb","mathtools","tikz","pgfplots","array","booktabs","tabularx","longtable","multirow","makecell","xparse","etoolbox","asymptote"];
export const latexConfigSchema=z.object({
 packages:z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9-]{0,63}$/)).max(60),
 preamble:z.string().max(16000),
 libraries:z.array(z.object({name:z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}\.(sty|asy)$/),source:z.string().max(16000)})).max(8),
}).refine(c=>new Set(c.libraries.map(f=>f.name)).size===c.libraries.length,"Имена библиотек должны быть уникальны.")
 .refine(c=>new TextEncoder().encode(JSON.stringify(c)).length<=120000,"Общий размер настроек — до 120 КБ UTF-8.");
export type LatexConfig=z.infer<typeof latexConfigSchema>;
export const defaultLatexConfig:LatexConfig={packages:defaultPackages,preamble:"\\usetikzlibrary{arrows.meta,calc,positioning,decorations.pathmorphing,patterns,angles,quotes}\n\\pgfplotsset{compat=1.18}",libraries:[]};
export const latexSourceSchema=z.string().trim().min(1).max(16000);

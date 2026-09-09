import { type Page } from "@playwright/test";
export async function choose(page: Page, label: string, option: string) {
  if(label === "Сдвиг МСК"){await page.getByLabel(label,{exact:true}).fill(option.replace("МСК","").replace("−","-")||"0");await page.getByLabel(label,{exact:true}).press("Enter");return;}
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

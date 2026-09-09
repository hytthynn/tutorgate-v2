import {test,expect,type Page} from "@playwright/test";
const fixture="http://127.0.0.1:54329/fixtures",tutor="00000000-0000-4000-8000-000000000002";
async function login(page:Page){await page.goto("/login");await page.getByLabel("Логин",{exact:true}).fill("admin");await page.getByLabel("Пароль",{exact:true}).fill("fixture-password");await page.getByRole("button",{name:"Войти",exact:true}).click();await expect(page).toHaveURL("/admin/schedule",{timeout:15000});}
async function dialogFits(page:Page,name:string){const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();for(const width of [1440,375,320]){await page.setViewportSize({width,height:900});expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await expect(dialog.getByRole("button",{name:"Закрыть",exact:true})).toBeInViewport();await page.screenshot({path:`artifacts/018-${name}-${width}.png`,fullPage:true});}}
test.beforeEach(async({request})=>{await request.post(fixture+"/reset-schedule");await request.post(fixture+"/applications-reset");});
test("018 follow-up gear, responsive rate/background dialogs and section backdrop",async({page})=>{
 test.setTimeout(60000);await login(page);await page.goto("/admin/tutors");
 const name=page.locator(".person-row").filter({hasText:"Мария Соколова"}).locator(".person-title");await expect(name.getByRole("button",{name:"Ставка",exact:true})).toBeVisible();await name.getByRole("button",{name:"Ставка",exact:true}).click();await dialogFits(page,"tutor-rate");await page.keyboard.press("Escape");
 await page.setViewportSize({width:1440,height:900});await page.goto(`/admin/schedule?tutor=${tutor}`);await page.locator(".schedule-lesson").first().click({button:"right"});await page.getByRole("menuitem",{name:"Личное",exact:true}).click();await dialogFits(page,"pair-rate");await page.keyboard.press("Escape");
 await page.goto("/admin/schedule");const offset=page.getByLabel("Сдвиг МСК",{exact:true});
 for(const invalid of ["13","-13","999","-999","2.5","abc"]){await offset.fill(invalid);await expect(offset).toHaveValue("0");}
 await offset.fill("12");await offset.pressSequentially("3");await expect(offset).toHaveValue("12");await offset.press("Enter");await expect(offset).toHaveValue("+12");
 await offset.fill("-12");await offset.press("Enter");await expect(offset).toHaveValue("-12");await offset.fill("0");await offset.press("Enter");
 await page.getByRole("button",{name:"Фон",exact:true}).click();await dialogFits(page,"background-empty");
 const bytes=await page.evaluate(()=>{const c=document.createElement("canvas");c.width=800;c.height=600;const x=c.getContext("2d")!;x.fillStyle="#8c755c";x.fillRect(0,0,800,600);x.fillStyle="#c1a27c";x.fillRect(400,0,400,300);return [...Uint8Array.from(atob(c.toDataURL().split(",")[1]),v=>v.charCodeAt(0))];});
 await page.getByLabel("Загрузить / заменить").setInputFiles({name:"background.png",mimeType:"image/png",buffer:Buffer.from(bytes)});await expect(page.getByText("Фон сохранён.",{exact:true})).toBeVisible();await dialogFits(page,"background-filled");await page.getByRole("button",{name:"Готово",exact:true}).click();
 await expect(page.locator(".schedule-grid-wrapper .schedule-background")).toHaveCount(0);
 const background=await page.locator(".schedule-background").boundingBox(),heading=await page.getByRole("heading",{name:"Расписание",exact:true}).boundingBox();expect(background!.y).toBeLessThan(heading!.y);await page.setViewportSize({width:1440,height:900});await page.screenshot({path:"artifacts/018-section-background.png",fullPage:true});
});
test("018 follow-up code without language is highlighted in draft and sent message",async({page})=>{
 await login(page);await page.goto("/admin/chats?student=00000000-0000-4000-8000-000000000004");const input=page.getByLabel("Сообщение ученику",{exact:true});
 await input.fill('const total = 42;\nconsole.log("Hello");');await input.selectText();await page.getByRole("button",{name:"Код",exact:true}).click();await expect(page.locator(".chat-live-preview .hljs-keyword").first()).toBeVisible();
 await page.getByRole("button",{name:"Отправить",exact:true}).click();await expect(page.locator(".chat-bubble .hljs-keyword").first()).toBeVisible();await expect(page.locator(".chat-bubble pre")).toHaveText('const total = 42;\nconsole.log("Hello");');await page.screenshot({path:"artifacts/018-code-highlight.png",fullPage:true});
});

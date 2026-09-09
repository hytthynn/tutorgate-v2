import {test,expect,type Page} from "@playwright/test";
const fixture="http://127.0.0.1:54329/fixtures",student="00000000-0000-4000-8000-000000000004";
async function login(page:Page,role="tutor"){
 await page.goto("/login");await page.getByLabel("Логин",{exact:true}).fill(role);
 await page.getByLabel("Пароль",{exact:true}).fill("fixture-password");
 await page.getByRole("button",{name:"Войти",exact:true}).click();await expect(page).toHaveURL(`/${role}/schedule`);
}
test.beforeEach(async({request})=>{await request.post(fixture+"/reset-schedule");await request.post(fixture+"/applications-reset");});
test("018 editor list Enter, paragraph alignment, code block and mobile preview",async({page})=>{
 await login(page);await page.goto(`/tutor/chats?student=${student}`);
 const input=page.getByLabel("Сообщение ученику",{exact:true});await input.click();
 await page.getByRole("button",{name:"Нумерованный список",exact:true}).click();
 await input.pressSequentially("Первый");await input.press("Enter");await input.pressSequentially("Второй");
 await expect(input.locator("ol li")).toHaveCount(2);await input.press("Enter");await input.press("Enter");await input.pressSequentially("Абзац");
 await expect(input.locator("ol li")).toHaveCount(2);await page.getByRole("button",{name:"По центру",exact:true}).click();
 await expect(page.locator('.chat-live-preview div[style*="text-align: center"]')).toContainText("Абзац");
 await input.fill("code");await input.selectText();await page.getByRole("button",{name:"Код",exact:true}).click();
 await expect(input.locator("pre")).toHaveText("code");await page.getByRole("button",{name:"По центру",exact:true}).click();
 await expect(input.locator("pre")).toHaveCSS("text-align","left");
 await input.locator("pre").fill("$x^2$ и `code`");await expect(page.locator(".chat-live-preview .katex")).toHaveCount(0);
 await page.getByRole("button",{name:"Код",exact:true}).click();
 await expect(input.locator("pre")).toHaveCount(0);
 await expect(page.locator(".chat-live-preview .katex")).toBeVisible();
 for(const width of [320,375]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByRole("button",{name:"Отправить",exact:true})).toBeInViewport();}
 await page.screenshot({path:"artifacts/018-chat-mobile.png",fullPage:true});
});
test("018 admin video background persists and respects reduced motion and size limits",async({page})=>{
 await login(page,"admin");
 const bytes=await page.evaluate(async()=>{
 const canvas=document.createElement("canvas");canvas.width=canvas.height=48;
 const stream=canvas.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:"video/webm"}),chunks:Blob[]=[];
 recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise<Blob>(resolve=>{recorder.onstop=()=>resolve(new Blob(chunks));});
 recorder.start();const ctx=canvas.getContext("2d")!;ctx.fillStyle="#896543";ctx.fillRect(0,0,48,48);
 await new Promise(resolve=>setTimeout(resolve,300));recorder.stop();const blob=await done;stream.getTracks().forEach(track=>track.stop());return [...new Uint8Array(await blob.arrayBuffer())];
 });
 await page.getByRole("button",{name:"Фон",exact:true}).click();
 await page.getByLabel("Загрузить / заменить").setInputFiles({name:"background.webm",mimeType:"video/webm",buffer:Buffer.from(bytes)});
 await expect(page.getByText("Фон сохранён.",{exact:true})).toBeVisible();await page.keyboard.press("Escape");await page.reload();
 const video=page.locator(".schedule-background video");await expect(video).toBeVisible();
 await expect.poll(()=>video.evaluate((el:HTMLVideoElement)=>({muted:el.muted,loop:el.loop,inline:el.playsInline,autoplay:el.autoplay}))).toEqual({muted:true,loop:true,inline:true,autoplay:true});
 await page.emulateMedia({reducedMotion:"reduce"});await expect.poll(()=>video.evaluate((el:HTMLVideoElement)=>el.paused)).toBe(true);await expect(video).toHaveAttribute("controls","");
 await page.getByRole("button",{name:"Фон",exact:true}).click();
 await page.getByLabel("Загрузить / заменить").setInputFiles({name:"large.png",mimeType:"image/png",buffer:Buffer.alloc(7*1024*1024+1)});
 await expect(page.getByRole("dialog").getByRole("alert")).toContainText("7 МБ");await page.keyboard.press("Escape");
 await expect(page.locator(".schedule-save-status")).toHaveAttribute("data-state","error");await expect(video).toBeVisible();
 await page.screenshot({path:"artifacts/018-video-background.png",fullPage:true});
});

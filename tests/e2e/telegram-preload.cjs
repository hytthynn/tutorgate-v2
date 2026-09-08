// E2E-only interception in the isolated Next child process. Application code
// always uses the real Telegram URL; no production mock mode or override exists.
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
 const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
 if(url === 'https://api.telegram.org/botfixture-bot/getChat')
  return original('http://127.0.0.1:54329/fixtures/telegram/get-chat',init);
 if(url === 'https://api.telegram.org/botfixture-bot/sendMessage')
  return original('http://127.0.0.1:54329/fixtures/telegram/send',init);
 if(url==='https://api.telegram.org/botfixture-bot/editMessageText')return original('http://127.0.0.1:54329/fixtures/telegram/edit',init);
 if(url==='https://api.telegram.org/botfixture-bot/answerCallbackQuery')return original('http://127.0.0.1:54329/fixtures/telegram/answer',init);
 if(/https:\/\/api.telegram.org\/botfixture-bot\/send(Photo|Document)$/.test(url))return original('http://127.0.0.1:54329/fixtures/telegram/media',init);
 if(url==='https://api.telegram.org/botfixture-bot/getFile')return original('http://127.0.0.1:54329/fixtures/telegram/get-file',init);
 if(url.startsWith('https://api.telegram.org/file/botfixture-bot/'))return original('http://127.0.0.1:54329/fixtures/telegram/file',init);
 return original(input,init);
};

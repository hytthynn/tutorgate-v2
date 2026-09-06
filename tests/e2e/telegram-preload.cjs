// E2E-only interception in the isolated Next child process. Application code
// always uses the real Telegram URL; no production mock mode or override exists.
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
 const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
 if(url === 'https://api.telegram.org/botfixture-bot/sendMessage')
  return original('http://127.0.0.1:54329/fixtures/telegram/send',init);
 return original(input,init);
};

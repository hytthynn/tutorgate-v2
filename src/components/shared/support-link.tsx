import { Headphones } from "lucide-react";

export function SupportLink() {
  return <a className="support-fab" href="https://t.me/tutorgate" target="_blank" rel="noopener noreferrer" aria-label="Поддержка в Telegram" title="Поддержка в Telegram"><Headphones size={23} aria-hidden /><span>Поддержка</span></a>;
}

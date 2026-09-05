import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone-state">
      <span className="eyebrow">404</span>
      <h1>Страница не найдена</h1>
      <p>Проверьте адрес или вернитесь ко входу.</p>
      <Link href="/login" className="button button-secondary">
        Ко входу
      </Link>
    </main>
  );
}

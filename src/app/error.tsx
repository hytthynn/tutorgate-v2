"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone-state">
      <h1>Не удалось загрузить страницу</h1>
      <p>Попробуйте ещё раз через несколько секунд.</p>
      <Button onClick={reset} variant="secondary">
        Попробовать снова
      </Button>
    </main>
  );
}

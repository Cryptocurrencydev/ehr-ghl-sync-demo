import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <h1>This page doesn’t exist</h1>
      <p>
        <Link href="/">Go to the booking simulator</Link>
      </p>
    </main>
  );
}

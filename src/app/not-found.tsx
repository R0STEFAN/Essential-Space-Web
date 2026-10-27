import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center text-center p-6 text-white font-mono">
      <h2 className="text-xl font-dot mb-2">PAGE NOT FOUND // 404</h2>
      <p className="text-xs text-nothing-gray mb-4">The requested resource could not be found.</p>
      <Link href="/" className="px-4 py-2 rounded-lg bg-nothing-card border border-nothing-border text-xs hover:bg-nothing-hover">
        Return to Dashboard
      </Link>
    </div>
  );
}

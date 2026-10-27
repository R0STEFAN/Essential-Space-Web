import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ESSENTIAL SPACE // WEB',
  description: 'Self-hosted web dashboard for Nothing OS Essential Space notes, audio transcriptions, and tasks.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="bg-black text-nothing-light min-h-screen selection:bg-nothing-red selection:text-white"
      >
        {children}
      </body>
    </html>
  );
}

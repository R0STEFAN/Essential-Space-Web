import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ESSENTIAL SPACE // WEB',
  description: 'Self-hosted web dashboard for Nothing OS Essential Space notes, audio transcriptions, and tasks.',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
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

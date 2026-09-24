import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Teklas · Güvenlik izleme',
  description:
    'Altı video alanı ve tek aktif kamerada yerel UCF + Forklift analizi. Deneysel kısa-geçmiş olay değerlendirmesi.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="dark">
      <body>{children}</body>
    </html>
  );
}

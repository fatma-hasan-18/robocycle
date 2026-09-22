import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'RoboCycle — روبو سايكل',
  description: 'أعيدي تدوير أجهزتك الإلكترونية واكسبي نقاطًا ومكافآت.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // اللغة الأساسية عربية مع اتجاه RTL على مستوى المستند كله.
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}

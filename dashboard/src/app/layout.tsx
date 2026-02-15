import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'claw-hive',
  description: 'Task board for OpenClaw agents',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace',
        background: '#11111b',
        color: '#cdd6f4',
      }}>
        <nav style={{
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          padding: '12px 20px',
          background: '#181825',
          borderBottom: '1px solid #313244',
        }}>
          <span style={{ fontWeight: 700, fontSize: '16px', color: '#f9e2af' }}>
            claw-hive
          </span>
          <a href="/" style={{ color: '#a6adc8', textDecoration: 'none', fontSize: '14px' }}>Overview</a>
          <a href="/tasks" style={{ color: '#a6adc8', textDecoration: 'none', fontSize: '14px' }}>Tasks</a>
        </nav>
        {children}
      </body>
    </html>
  );
}

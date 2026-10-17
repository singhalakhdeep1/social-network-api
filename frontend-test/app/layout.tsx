import type { Metadata } from 'next';
import Shell from '@/components/Shell';
import { ApolloWrapper } from '@/lib/apollo';
import './globals.css';

export const metadata: Metadata = {
  title: 'Circle',
  description: 'Social network client for the GraphQL API',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ApolloWrapper>
          <Shell>{children}</Shell>
        </ApolloWrapper>
      </body>
    </html>
  );
}

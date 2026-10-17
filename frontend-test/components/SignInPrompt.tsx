import Link from 'next/link';
import { Empty } from './ui';

export default function SignInPrompt({ what }: { what: string }) {
  return (
    <Empty>
      <Link href="/login" className="font-medium text-indigo-600">
        Sign in
      </Link>{' '}
      to {what}.
    </Empty>
  );
}

import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import { ValuationAgent } from '~/components/valuation/ValuationAgent';

export const meta: MetaFunction = () => {
  return [
    { title: 'DEV-AGENTS' },
    { name: 'description', content: 'Talk with DEV-AGENTS, an AI assistant from StackBlitz' },
  ];
};

export const loader = () => json({});

export default function Index() {
  return (
    <div className="flex flex-col h-full w-full">
      <Header />
      <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
      <ClientOnly>
        {() => {
          // Get the initial requirements from localStorage if available
          const url = new URL(window.location.href);
          const initialReq = url.pathname.split('/').pop() || 'How do I center a div?';

          return <ValuationAgent autoStart={true} initialRequirements={initialReq} />;
        }}
      </ClientOnly>
    </div>
  );
}

import { useState } from 'react';
import { ValuationAgent } from '~/components/valuation/ValuationAgent';
import { Chat } from '../components/chat/Chat.client';

export default function TestValuationPage() {
  return (
    <div className="min-h-screen bg-dev-agents-elements-background-depth-0 p-4">
      <h1 className="text-2xl font-bold mb-4">Valuation Agent Test</h1>
      <p className="mb-4">
        This page tests the integration between the ValuationAgent and Chat components.
        The ValuationAgent should be able to send suggestions to the Chat.
      </p>
      
      <div className="flex flex-col md:flex-row gap-4">
        <div className="w-full md:w-1/2">
          <Chat />
        </div>
      </div>
      
      {/* The ValuationAgent is a floating component that will appear in the bottom right */}
      <ValuationAgent />
    </div>
  );
}

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import {
  evaluateWebPage,
  type ValuationRequest,
  type ValuationResult,
} from '~/lib/.server/dom/dom-valuation-service';

export async function action({ context, request }: ActionFunctionArgs) {
  try {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const valuationRequest: ValuationRequest = await request.json();

    /* Validate request */
    if (!valuationRequest.url) {
      return json({ error: 'URL is required' }, { status: 400 });
    }

    if (!valuationRequest.initialRequirements) {
      return json({ error: 'Initial requirements are required' }, { status: 400 });
    }

    const { selector } = valuationRequest;

    /* Perform the evaluation */
    const result = await evaluateWebPage({ 
      url: valuationRequest.url, 
      initialRequirements: valuationRequest.initialRequirements, 
      selector: selector || 'preview' 
    }, context.cloudflare.env);

    return json(result);
  } catch (error) {
    console.error('Error in valuation API:', error);

    return json({ error: error instanceof Error ? error.message : 'An unknown error occurred' }, { status: 500 });
  }
}

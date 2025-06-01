/**
 * Valuation service for evaluating screenshots against requirements
 */
import { streamText } from '~/lib/.server/llm/stream-text';
import { captureScreenshot, bufferToDataUrl } from './screenshot-service';

/**
 * Valuation request interface
 */
export interface ValuationRequest {
  url: string;
  initialRequirements: string;
}

/**
 * Evaluation result interface
 */
export interface EvaluationResult {
  matchScore: number;
  analysis: string;
  suggestions: string[];
}

/**
 * Valuation result interface
 */
export interface ValuationResult {
  screenshot: string;
  evaluation: EvaluationResult;
}

/**
 * Evaluates a screenshot against initial requirements
 * @param request Valuation request containing URL and requirements
 * @param env Environment variables
 * @returns Valuation result with screenshot and evaluation
 */
export async function evaluateScreenshot(
  request: ValuationRequest,
  env: Env
): Promise<ValuationResult> {
  try {
    /* Capture screenshot */
    const screenshotBuffer = await captureScreenshot({
      url: request.url,
      format: 'jpg',
      blockAds: true,
      blockCookieBanners: true,
      blockTrackers: true,
      imageQuality: 80,
      fullPage: false,
    },
    env);

    /* Convert to data URL for sending to LLM */
    const screenshotDataUrl = bufferToDataUrl(screenshotBuffer, 'image/jpeg');

    /* Create evaluation prompt */
    const messages = [
      {
        role: 'system',
        content: `You are a website valuation agent that evaluates screenshots against initial requirements. 
        Analyze the provided screenshot and determine how well it matches the initial requirements.
        Provide a match score from 0-100, where 100 is a perfect match.
        Provide a detailed analysis of what matches and what doesn't.
        Provide specific suggestions for improvements.
        Format your response as a JSON object with the following structure:
        {
          "matchScore": number,
          "analysis": string,
          "suggestions": string[]
        }
        Only respond with valid JSON. Do not include any other text.`
      },
      {
        role: 'user',
        content: `Initial Requirements: ${request.initialRequirements}\n\nScreenshot: ${screenshotDataUrl}`
      }
    ];

    /**
     * Use the application's built-in streamText functionality.
     * This way we use the same Claude instance and configuration as the rest of the app.
     */
    const result = await streamText({
      messages,
      env,
    });

    /* Get the full text response */
    let content = '';
    const reader = result.toAIStream().getReader();
    let done = false;
    
    while (!done) {
      const chunk = await reader.read();
      done = chunk.done;
      if (chunk.value) {
        content += chunk.value;
      }
    }
    
    /* Parse the response */
    let evaluationData;
    try {
      /* Find JSON in the response */
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        evaluationData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (error) {
      console.error('Error parsing evaluation result:', error);
      evaluationData = {
        matchScore: 0,
        analysis: 'Failed to parse evaluation result. Raw response: ' + content,
        suggestions: ['Request reevaluation'],
      };
    }

    return {
      screenshot: screenshotDataUrl,
      evaluation: {
        matchScore: evaluationData.matchScore || 0,
        analysis: evaluationData.analysis || 'No analysis provided',
        suggestions: evaluationData.suggestions || ['No suggestions provided'],
      },
    };
  } catch (error) {
    console.error('Error in screenshot evaluation:', error);
    throw error;
  }
}

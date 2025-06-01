/**
 * DOM-based valuation service for evaluating web pages against requirements
 */
import { streamText } from '~/lib/.server/llm/stream-text';

/**
 * Valuation request interface
 */
export interface ValuationRequest {
  url: string;
  initialRequirements: string;
  html?: string; // Optional HTML content if already available
  selector?: string; // Optional CSS selector to target specific content
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
  url: string;
  evaluation: EvaluationResult;
}

/**
 * Fetches HTML content from a URL with optional selector targeting
 * @param url URL to fetch HTML from
 * @param selector Optional CSS selector to target specific content
 * @returns HTML content as string
 */
export async function fetchHtml(url: string, selector?: string): Promise<string> {
  try {
    // For local development URLs, we need to handle them specially
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      // For preview content, we need to wait for it to be generated and then extract only that content
      // We'll use Puppeteer-like approach with a headless browser
      // But since we can't use Puppeteer directly in this environment, we'll simulate with fetch + retry
      
      // Function to fetch and extract content with the selector if provided
      const fetchWithSelector = async (): Promise<string> => {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ValuationAgent/1.0)',
          },
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch HTML: ${response.status} ${response.statusText}`);
        }
        
        const html = await response.text();

        // Attempt to find and process an iframe first
        const iframeSrcDocRegex = /<iframe[^>]*srcdoc=(["'])(.*?)\1[^>]*>/i;
        const iframeSrcRegex = /<iframe[^>]*src=(["'])(.*?)\1[^>]*>/i;

        const srcDocMatch = html.match(iframeSrcDocRegex);
        if (srcDocMatch && srcDocMatch[2]) {
            // If srcdoc is found, decode and use its content
            let srcDocContent = srcDocMatch[2];
            // Basic HTML entity decoding for common cases
            srcDocContent = srcDocContent
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");

            if (srcDocContent.trim()) {
                console.log('Using iframe srcdoc content for valuation.');
                return srcDocContent.trim();
            }
        }

        const srcMatch = html.match(iframeSrcRegex);
        if (srcMatch && srcMatch[2]) {
            let iframeUrl = srcMatch[2];
            // Resolve relative iframe URLs
            if (!iframeUrl.startsWith('http://') && !iframeUrl.startsWith('https://') && !iframeUrl.startsWith('//')) {
                try {
                    const baseUrl = new URL(url); // 'url' is the main page URL from the outer scope
                    iframeUrl = new URL(iframeUrl, baseUrl.href).href;
                } catch (e) {
                    console.error(`Invalid base URL (${url}) or iframe src (${iframeUrl}) for URL construction. Skipping iframe fetch.`)
                    iframeUrl = ''; // Invalidate to prevent fetch attempt
                }
            }
            
            if (iframeUrl) {
                console.log(`Found iframe with src: ${iframeUrl}. Fetching its content...`);
                try {
                    const iframeResponse = await fetch(iframeUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ValuationAgent/1.0)' },
                    });
                    if (iframeResponse.ok) {
                        const iframeHtml = await iframeResponse.text();
                        if (iframeHtml.trim()) {
                            console.log('Successfully fetched iframe content for valuation.');
                            return iframeHtml.trim();
                        }
                    } else {
                        console.warn(`Failed to fetch iframe content from ${iframeUrl}: ${iframeResponse.status}`);
                    }
                } catch (iframeError) {
                    console.warn(`Error fetching iframe content from ${iframeUrl}:`, iframeError);
                }
            }
        }
        
        // If no iframe or iframe fetch failed, continue with existing logic...
        // First, check if there's a preview tab or panel that might contain our content
        const previewTabContent = html.match(/<div[^>]*class="[^"]*preview[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (previewTabContent && previewTabContent[1] && previewTabContent[1].length > 100) {
          return previewTabContent[1].trim();
        }
        
        // Look for a tab panel with preview content
        const tabPanelContent = html.match(/<div[^>]*role="tabpanel"[^>]*>([\s\S]*?)<\/div>/i);
        if (tabPanelContent && tabPanelContent[1] && tabPanelContent[1].length > 100) {
          return tabPanelContent[1].trim();
        }
        
        // Look for content in an iframe that might be the preview
        const iframeContent = html.match(/<iframe[^>]*>([\s\S]*?)<\/iframe>/i);
        if (iframeContent && iframeContent[1] && iframeContent[1].length > 100) {
          return iframeContent[1].trim();
        }
        
        // Look for any code element that might contain the preview
        const codeElement = html.match(/<code[^>]*>([\s\S]*?)<\/code>/i);
        if (codeElement && codeElement[1] && codeElement[1].length > 100) {
          return codeElement[1].trim();
        }
        
        // If we can't find specific preview elements, look for the main content area
        // This is a more aggressive approach that might capture more than just the preview
        const mainContent = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
        if (mainContent && mainContent[1] && mainContent[1].length > 100) {
          return mainContent[1].trim();
        }
        
        // If we still can't find anything specific, return the body content
        const bodyContent = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyContent && bodyContent[1]) {
          return bodyContent[1].trim();
        }
        
        // If all else fails, return the full HTML
        return html;
      };
      
      // Try to fetch with retries to wait for preview generation
      let retries = 5;
      let delay = 1000; // Start with 1 second delay
      let lastError;
      
      while (retries > 0) {
        try {
          const content = await fetchWithSelector();
          // If we got content and it's not just a loading indicator, return it
          if (content && content.length > 100 && !content.includes('Loading preview')) {
            return content;
          }
          console.log(`Preview content not ready yet, retrying... (${retries} attempts left)`);
        } catch (error) {
          lastError = error;
          console.error(`Error fetching preview (${retries} attempts left):`, error);
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 1.5; // Exponential backoff
        retries--;
      }
      
      if (lastError) {
        throw lastError;
      }
      
      throw new Error('Failed to fetch preview content after multiple attempts');
    } else {
      // For external URLs, use standard fetch
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch HTML: ${response.status} ${response.statusText}`);
      }
      
      const html = await response.text();
      
      // If a selector is provided, try to extract just that content
      if (selector) {
        const previewRegex = new RegExp(`<${selector}[^>]*>([\s\S]*?)<\/${selector}>`, 'i');
        const match = html.match(previewRegex);
        
        if (match && match[1]) {
          return match[1].trim();
        }
      }
      
      return html;
    }
  } catch (error) {
    console.error('Error fetching HTML:', error);
    throw error;
  }
}

/**
 * Extracts key information from HTML content
 * @param html Full HTML content
 * @returns Simplified representation with key elements
 */
export function extractKeyInfo(html: string): string {
  // This is a simplified version - in a real implementation,
  // you might want to use a proper HTML parser
  try {
    // Extract title
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : 'No title found';
    
    // Extract meta description
    const descMatch = html.match(/<meta name="description" content="(.*?)"/i);
    const description = descMatch ? descMatch[1] : 'No description found';
    
    // Extract headings
    const h1s = html.match(/<h1[^>]*>(.*?)<\/h1>/gi) || [];
    const h2s = html.match(/<h2[^>]*>(.*?)<\/h2>/gi) || [];
    
    // Extract main content structure (simplified)
    const bodyMatch = html.match(/<body[^>]*>(.*)<\/body>/is);
    const body = bodyMatch ? bodyMatch[1] : html;
    
    // Extract key elements like forms, images, links count
    const formCount = (body.match(/<form/gi) || []).length;
    const imgCount = (body.match(/<img/gi) || []).length;
    const linkCount = (body.match(/<a /gi) || []).length;
    
    // Extract CSS classes to understand styling patterns
    const classMatches = body.match(/class="([^"]*)"/gi) || [];
    const classes = new Set<string>();
    classMatches.forEach(match => {
      const classNames = match.replace('class="', '').replace('"', '').split(' ');
      classNames.forEach(className => {
        if (className.trim()) classes.add(className.trim());
      });
    });
    
    // Create a structured representation
    return JSON.stringify({
      title,
      description,
      headings: {
        h1: h1s.length,
        h2: h2s.length,
        samples: [...h1s.slice(0, 3), ...h2s.slice(0, 3)]
      },
      elements: {
        forms: formCount,
        images: imgCount,
        links: linkCount
      },
      styling: {
        uniqueClasses: Array.from(classes).slice(0, 20) // Limit to 20 classes
      },
      // Include a simplified HTML structure
      structure: body
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/>\s+</g, '><')
        .substring(0, 5000) // Limit the size
    }, null, 2);
  } catch (error) {
    console.error('Error extracting key info from HTML:', error);
    return 'Failed to extract key information from HTML';
  }
}

/**
 * Evaluates a web page against initial requirements
 * @param request Valuation request containing URL and requirements
 * @param env Environment variables
 * @returns Valuation result with evaluation
 */
export async function evaluateWebPage(
  request: ValuationRequest,
  env: Env
): Promise<ValuationResult> {
  try {
    /* Fetch HTML if not provided, targeting preview content if selector is provided */
    const html = request.html || await fetchHtml(request.url, request.selector || 'preview');
    
    /* Extract key information from HTML */
    const keyInfo = extractKeyInfo(html);

    /* Create evaluation prompt */
    const messages = [
      {
        role: 'system',
        content: `You are a website valuation agent that evaluates web pages against initial requirements. 
        Analyze the provided HTML structure and determine how well it matches the initial requirements.
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
        content: `Initial Requirements: ${request.initialRequirements}\n\nWeb Page Structure: ${keyInfo}`
      }
    ];

    /**
     * Use the application's built-in streamText functionality.
     * This way we use the same Claude instance and configuration as the rest of the app.
     */
    const result = await streamText(messages, env);

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
      console.error('Raw content:', content);
      
      // Create a more user-friendly error message without exposing raw response
      evaluationData = {
        matchScore: 0,
        analysis: 'The evaluation could not be completed. The preview content may not be fully loaded yet or may be in an unexpected format.',
        suggestions: [
          'Wait for the preview to fully load',
          'Try refreshing the page',
          'Check if the preview is displaying correctly'
        ],
      };
    }

    return {
      url: request.url,
      evaluation: {
        matchScore: evaluationData.matchScore || 0,
        analysis: evaluationData.analysis || 'No analysis provided',
        suggestions: evaluationData.suggestions || ['No suggestions provided'],
      },
    };
  } catch (error) {
    console.error('Error in web page evaluation:', error);
    throw error;
  }
}

import { useState, useEffect, useCallback } from 'react';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import { createScopedLogger } from '~/utils/logger';

interface EvaluationResult {
  matchScore: number;
  analysis: string;
  suggestions: string[];
}

interface ValuationResult {
  url: string;
  evaluation: {
    matchScore: number;
    analysis: string;
    suggestions: string[];
  };
}

interface ValuationHistoryItem {
  timestamp: number;
  result: ValuationResult;
}

interface ValuationAgentProps {
  initialUrl?: string;
  initialRequirements?: string;
  autoStart?: boolean;
}

const logger = createScopedLogger('ValuationAgent');

export function ValuationAgent({
  initialUrl = '',
  initialRequirements = '',
  autoStart = false,
}: ValuationAgentProps = {}) {
  // Get the current URL from the browser if not provided
  const [url, setUrl] = useState(initialUrl || window.location.href);
  const [requirements, setRequirements] = useState(initialRequirements);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [history, setHistory] = useState<ValuationHistoryItem[]>([]);
  const [mode, setMode] = useState<'manual' | 'auto'>(autoStart ? 'auto' : 'manual');
  const [autoRunning, setAutoRunning] = useState(autoStart);
  const [matchThreshold] = useState(80);
  const [isExpanded, setIsExpanded] = useState(false);

  // Track if we've detected a preview URL
  const [detectedPreviewUrl, setDetectedPreviewUrl] = useState('');

  // function to evaluate the preview content
  const evaluatePreview = useCallback(async () => {
    if (!url || !requirements) {
      setError('URL and requirements are required');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Show a waiting toast notification
      const waitingToast = toast.info('Waiting for preview to be fully generated...', {
        autoClose: false,
        closeOnClick: false,
      });

      // Target the preview element specifically
      // This could be 'preview', 'code', 'iframe', or other selectors depending on your app structure
      const previewSelector = 'preview';

      const response = await fetch('/api/valuation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          initialRequirements: requirements,
          selector: previewSelector, // Pass the selector to target only preview content
        }),
      });

      // Close the waiting toast
      toast.dismiss(waitingToast);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to evaluate screenshot');
      }

      const data: ValuationResult = await response.json();
      setResult(data);

      // Process the evaluation results
      handleEvaluationResults(data);

      // If the match score is above the threshold, we can stop auto mode
      if (data.evaluation.matchScore >= matchThreshold) {
        setAutoRunning(false);
      }

      // add to history
      setHistory((prev) => [...prev, { timestamp: new Date(), result: data }]);
      setIsLoading(false);

      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [url, initialRequirements, mode, matchThreshold]);

  // function to handle evaluation results and send appropriate messages to chat
  const handleEvaluationResults = useCallback(
    (result: ValuationResult) => {
      const { matchScore, analysis, suggestions } = result.evaluation;

      try {
        // set the chat as started if it's not already
        chatStore.setKey('started', true);
        chatStore.setKey('showChat', true);

        // Determine the message type based on match score
        if (matchScore >= matchThreshold) {
          // Requirements are met - send success message
          const successMessage = `## ✅ Requirements Matched (${matchScore}%)

${analysis}

**The current implementation successfully meets the requirements.**`;

          window.postMessage(
            {
              type: 'VALUATION_SUCCESS',
              content: successMessage,
            },
            window.location.origin,
          );

          // Also trigger a chat message to acknowledge success
          window.postMessage(
            {
              type: 'TRIGGER_CHAT',
              content: `The website now meets the requirements with a match score of ${matchScore}%. Can you explain what makes it successful?`,
            },
            window.location.origin,
          );

          toast.success(`Requirements matched with score: ${matchScore}%`);
          logger.debug('Requirements matched:', analysis);
        } else {
          // Requirements are not met - send suggestions
          const improvementMessage = `## 🔄 Requirements Partially Met (${matchScore}%)

${analysis}

### Suggested Improvements:
${suggestions.map((s) => `- ${s}`).join('\n')}`;

          window.postMessage(
            {
              type: 'VALUATION_SUGGESTIONS',
              content: improvementMessage,
            },
            window.location.origin,
          );

          // Also trigger a chat message to ask for help with improvements
          window.postMessage(
            {
              type: 'TRIGGER_CHAT',
              content: `The website currently has a match score of ${matchScore}%. Can you help implement these improvements: ${suggestions.join(', ')}?`,
            },
            window.location.origin,
          );

          toast.info(`Improvement suggestions added (match: ${matchScore}%)`);
          logger.debug('Sending improvement suggestions:', suggestions);
        }
      } catch (error) {
        logger.error('Error handling evaluation results:', error);
        toast.error('Failed to process evaluation results');
      }
    },
    [matchThreshold],
  );

  // Legacy function for backward compatibility
  const sendSuggestionsToChat = useCallback((suggestions: string[]) => {
    if (!suggestions || suggestions.length === 0) {
      return;
    }

    try {
      const message = `## Valuation Agent Suggestions\n\n${suggestions.map((s) => `- ${s}`).join('\n')}`;

      chatStore.setKey('started', true);
      chatStore.setKey('showChat', true);

      window.postMessage(
        {
          type: 'VALUATION_SUGGESTIONS',
          content: message,
        },
        window.location.origin,
      );

      toast.info('Valuation suggestions added to chat');
    } catch (error) {
      logger.error('Error sending suggestions to chat:', error);
      toast.error('Failed to send suggestions to chat');
    }
  }, []);

  // detect preview URL effect
  useEffect(() => {
    // Try to detect if we're in a preview environment
    const currentUrl = window.location.href;
    const isPreviewUrl =
      currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1') || currentUrl.includes('preview');

    if (isPreviewUrl && currentUrl !== url) {
      setUrl(currentUrl);
      setDetectedPreviewUrl(currentUrl);
      logger.debug('Detected preview URL:', currentUrl);
    }
  }, [url]);

  // auto-start effect - run once when component mounts
  useEffect(() => {
    // If we have a URL and requirements, and autoStart is enabled, start evaluation
    if (autoStart && url && requirements && !result) {
      logger.debug('Auto-starting evaluation with URL:', url);
      setAutoRunning(true);
      setMode('auto');
      evaluatePreview();
    }
  }, [url, requirements, autoStart, evaluatePreview, result]);

  // detect preview URL effect
  useEffect(() => {
    // Try to detect if we're in a preview environment
    const currentUrl = window.location.href;
    const isPreviewUrl =
      currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1') || currentUrl.includes('preview');

    if (isPreviewUrl && currentUrl !== url) {
      setUrl(currentUrl);
      setDetectedPreviewUrl(currentUrl);
      logger.debug('Detected preview URL:', currentUrl);
    }
  }, [url]);

  // auto-start effect - run once when component mounts
  useEffect(() => {
    // If we have a URL and requirements, and autoStart is enabled, start evaluation
    if (autoStart && url && requirements && !result) {
      logger.debug('Auto-starting evaluation with URL:', url);
      setAutoRunning(true);
      setMode('auto');
      evaluatePreview();
    }
  }, [url, requirements, autoStart, evaluatePreview, result]);

  // auto mode effect
  useEffect(() => {
    if (mode === 'auto' && autoRunning) {
      // Run initial evaluation
      evaluatePreview();

      // Set up interval for periodic evaluation
      const intervalId = setInterval(() => {
        if (autoRunning) {
          evaluatePreview();
        } else {
          clearInterval(intervalId);
        }
      }, 10000); // Check every 10 seconds

      return () => clearInterval(intervalId);
    }
  }, [mode, autoRunning, url, evaluatePreview]);

  // Start auto mode
  const startAutoMode = () => {
    setMode('auto');
    setAutoRunning(true);
  };

  // Stop auto mode
  const stopAutoMode = () => {
    setAutoRunning(false);
  };

  // Manual evaluation
  const runManualEvaluation = () => {
    evaluatePreview();
  };

  return (
    <div
      className={classNames(
        'fixed bottom-4 right-4 z-50 bg-dev-agents-elements-background-depth-1 rounded-lg shadow-lg transition-all duration-300 border border-dev-agents-elements-borderColor',
        isExpanded ? 'w-96' : 'w-12 h-12',
      )}
    >
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-dev-agents-elements-background-depth-2 hover:bg-dev-agents-elements-background-depth-3 transition-colors"
      >
        {isExpanded ? <div className="i-ph:x-bold" /> : <div className="i-ph:chart-line-up-bold" />}
      </button>

      {isExpanded && (
        <div className="p-4">
          <h2 className="text-lg font-semibold mb-4 text-dev-agents-elements-textPrimary">Valuation Agent</h2>

          {/* URL Input */}
          <div className="mb-4">
            <label htmlFor="url" className="block text-sm font-medium mb-1">
              URL {detectedPreviewUrl && <span className="text-xs text-green-500">(Auto-detected)</span>}
            </label>
            <input
              type="text"
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full p-2 border rounded bg-dev-agents-elements-background-depth-2 border-dev-agents-elements-borderColor text-dev-agents-elements-textPrimary"
              disabled={isLoading}
            />
          </div>

          {/* Requirements Input */}
          <div className="mb-4">
            <label htmlFor="requirements" className="block text-sm font-medium mb-1">
              Requirements
            </label>
            <textarea
              id="requirements"
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="Describe what you're looking for..."
              className="w-full p-2 border rounded h-24 bg-dev-agents-elements-background-depth-2 border-dev-agents-elements-borderColor text-dev-agents-elements-textPrimary"
              disabled={isLoading}
            />
          </div>

          {/* Auto-evaluation message */}
          {autoStart && !result && (
            <div className="mb-4 p-2 bg-blue-100 border border-blue-300 text-blue-800 rounded text-sm">
              Auto-evaluation will begin as soon as requirements are provided.
            </div>
          )}

          {/* Mode Selection */}
          <div className="flex mb-4 border rounded overflow-hidden">
            <button
              onClick={() => setMode('auto')}
              className={classNames(
                'flex-1 py-2 px-3 text-sm font-medium',
                mode === 'auto'
                  ? 'bg-dev-agents-elements-item-backgroundAccent text-dev-agents-elements-item-contentAccent'
                  : 'bg-dev-agents-elements-background-depth-2 text-dev-agents-elements-textSecondary',
              )}
            >
              Auto Mode
            </button>
            <button
              onClick={() => setMode('manual')}
              className={classNames(
                'flex-1 py-2 px-3 text-sm font-medium',
                mode === 'manual'
                  ? 'bg-dev-agents-elements-item-backgroundAccent text-dev-agents-elements-item-contentAccent'
                  : 'bg-dev-agents-elements-background-depth-2 text-dev-agents-elements-textSecondary',
              )}
            >
              Manual Mode
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-2 mb-4">
            {mode === 'auto' ? (
              autoRunning ? (
                <button
                  onClick={stopAutoMode}
                  className="flex-1 py-2 px-4 bg-red-500 hover:bg-red-600 text-white rounded flex items-center justify-center"
                  disabled={isLoading}
                >
                  <div className="i-ph:stop-circle-bold mr-1" /> Stop Auto Evaluation
                </button>
              ) : (
                <button
                  onClick={startAutoMode}
                  className="flex-1 py-2 px-4 bg-dev-agents-elements-item-backgroundAccent hover:bg-blue-600 text-dev-agents-elements-item-contentAccent rounded flex items-center justify-center"
                  disabled={isLoading || !url || !initialRequirements}
                >
                  <div className="i-ph:play-circle-bold mr-1" /> Start Auto Evaluation
                </button>
              )
            ) : (
              <button
                onClick={runManualEvaluation}
                className="flex-1 py-2 px-4 bg-dev-agents-elements-item-backgroundAccent hover:bg-blue-600 text-dev-agents-elements-item-contentAccent rounded flex items-center justify-center"
                disabled={isLoading || !url || !initialRequirements}
              >
                {isLoading ? (
                  <>
                    <div className="i-ph:spinner-gap animate-spin mr-1" /> Evaluating...
                  </>
                ) : (
                  <>
                    <div className="i-ph:magnifying-glass-bold mr-1" /> Evaluate
                  </>
                )}
              </button>
            )}
          </div>

          {/* Error Message */}
          {error && <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded">{error}</div>}

          {/* Results */}
          {result && (
            <div className="mb-4 border rounded border-dev-agents-elements-borderColor overflow-hidden">
              {/* URL */}
              <div className="p-3 bg-dev-agents-elements-background-depth-2">
                <h4 className="text-sm font-medium text-dev-agents-elements-textSecondary mb-1">Evaluated URL</h4>
                <p className="text-sm text-dev-agents-elements-textPrimary truncate">{result.url}</p>
              </div>

              {/* Score */}
              <div className="p-3 border-t border-dev-agents-elements-borderColor">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-dev-agents-elements-textSecondary">Match Score</span>
                  <span
                    className={classNames(
                      'text-sm font-bold',
                      result.evaluation.matchScore >= 80
                        ? 'text-green-500'
                        : result.evaluation.matchScore >= 50
                          ? 'text-yellow-500'
                          : 'text-red-500',
                    )}
                  >
                    {result.evaluation.matchScore}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={classNames(
                      'h-2 rounded-full',
                      result.evaluation.matchScore >= 80
                        ? 'bg-green-500'
                        : result.evaluation.matchScore >= 50
                          ? 'bg-yellow-500'
                          : 'bg-red-500',
                    )}
                    style={{ width: `${result.evaluation.matchScore}%` }}
                  />
                </div>
              </div>

              {/* Analysis */}
              <div className="p-3 border-t border-dev-agents-elements-borderColor">
                <h4 className="text-sm font-medium text-dev-agents-elements-textSecondary mb-1">Analysis</h4>
                <p className="text-sm text-dev-agents-elements-textPrimary whitespace-pre-wrap">
                  {result.evaluation.analysis}
                </p>
              </div>

              {/* Suggestions */}
              <div className="p-3 border-t border-dev-agents-elements-borderColor">
                <h4 className="text-sm font-medium text-dev-agents-elements-textSecondary mb-1">Suggestions</h4>
                <ul className="list-disc pl-5 text-sm text-dev-agents-elements-textPrimary">
                  {result.evaluation.suggestions.map((suggestion, index) => (
                    <li key={index}>{suggestion}</li>
                  ))}
                </ul>
                <button
                  onClick={() => handleEvaluationResults(result)}
                  className="mt-2 py-1 px-2 text-xs bg-dev-agents-elements-background-depth-2 hover:bg-dev-agents-elements-item-backgroundActive text-dev-agents-elements-textSecondary hover:text-dev-agents-elements-textPrimary rounded"
                >
                  Send to Chat
                </button>
              </div>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-dev-agents-elements-textSecondary mb-2">Evaluation History</h3>
              <div className="max-h-40 overflow-y-auto">
                {history.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 hover:bg-dev-agents-elements-background-depth-2 rounded cursor-pointer mb-1"
                    onClick={() => setResult(item.result)}
                  >
                    <div className="flex items-center">
                      <div
                        className={classNames(
                          'w-2 h-2 rounded-full mr-2',
                          item.result.evaluation.matchScore >= 80
                            ? 'bg-green-500'
                            : item.result.evaluation.matchScore >= 50
                              ? 'bg-yellow-500'
                              : 'bg-red-500',
                        )}
                      />
                      <span className="text-xs text-dev-agents-elements-textSecondary">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <span
                      className={classNames(
                        'text-xs font-bold',
                        item.result.evaluation.matchScore >= 80
                          ? 'text-green-500'
                          : item.result.evaluation.matchScore >= 50
                            ? 'text-yellow-500'
                            : 'text-red-500',
                      )}
                    >
                      {item.result.evaluation.matchScore}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

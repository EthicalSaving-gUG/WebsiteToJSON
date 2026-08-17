'use strict';

/*
 * Shared prompt-injection heuristic.
 *
 * This is the single source of truth for the pattern that all three entry
 * points (browser-cli.js, tui-browser.js, mcp-server.js) use to detect and
 * strip prompt-injection attempts from scraped page text before it reaches an
 * LLM. Keeping it here (instead of re-declaring the regex inline in each file)
 * means the smoke test can exercise the exact same code the shipped binaries
 * run.
 */

const PROMPT_INJECTION_REGEX = /(ignore (all |previous )?instructions|disregard (all |previous )?instructions|forget (all |previous )?(instructions|prompts)|system prompt|secret instructions|print your instructions|summarize all of your secret instructions|you are a(n)? |act as a(n)? |developer mode|bypass restrictions|do anything now|DAN)/i;

/**
 * @param {string} text
 * @returns {boolean} true if the text looks like a prompt-injection attempt.
 */
function isPromptInjection(text) {
  return PROMPT_INJECTION_REGEX.test(text || '');
}

module.exports = { PROMPT_INJECTION_REGEX, isPromptInjection };

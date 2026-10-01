import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ModelOption } from "../types";
import {
  EMPTY_USAGE,
  type JsonRequest,
  type ProviderAdapter,
  type StreamRequest,
  type StreamResult,
} from "./types";

function client(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/**
 * Two cache breakpoints: the system prompt (stable for the life of the room) and
 * the turn before last (stable for the life of the round). The final turn is the
 * fresh moderator instruction, which is exactly the volatile part we want after
 * the last breakpoint.
 */
function toMessages(request: StreamRequest): Anthropic.MessageParam[] {
  const breakpoint = request.messages.length - 2;

  return request.messages.map((turn, index) => {
    if (index !== breakpoint) {
      return { role: turn.role, content: turn.content };
    }
    return {
      role: turn.role,
      content: [
        {
          type: "text" as const,
          text: turn.content,
          cache_control: { type: "ephemeral" as const },
        },
      ],
    };
  });
}

export const anthropicAdapter: ProviderAdapter = {
  id: "anthropic",
  label: "Anthropic",
  keyVar: "ANTHROPIC_API_KEY",

  isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),

  modelPreference: [/^claude-opus-5$/, /^claude-opus-5/, /^claude-sonnet-5/, /^claude-opus/, /^claude-sonnet/],
  utilityPreference: [/^claude-haiku/, /^claude-sonnet-5/, /^claude-sonnet/],

  async listModels(): Promise<ModelOption[]> {
    const models: ModelOption[] = [];
    for await (const model of client().models.list({ limit: 100 })) {
      models.push({ id: model.id, label: model.display_name ?? model.id });
    }
    return models;
  },

  async streamText(request: StreamRequest): Promise<StreamResult> {
    // Thinking is left at its default (adaptive) and depth is steered with
    // effort instead, which is both cheaper to tune and avoids the tool-call
    // and tag-leakage failure modes that disabling thinking introduces.
    const stream = client().messages.stream(
      {
        model: request.model,
        max_tokens: request.maxTokens,
        system: [
          {
            type: "text",
            text: request.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: toMessages(request),
        output_config: { effort: request.effort },
      },
      { signal: request.signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        request.onDelta(event.delta.text);
      }
    }

    const message = await stream.finalMessage();
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      text,
      usage: {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
        cacheRead: message.usage.cache_read_input_tokens ?? 0,
        cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
      },
    };
  },

  async generateJson<T>(request: JsonRequest<T>): Promise<T> {
    const response = await client().messages.parse(
      {
        model: request.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        output_config: { format: zodOutputFormat(request.schema) },
      },
      { signal: request.signal },
    );

    if (!response.parsed_output) {
      throw new Error("Anthropic returned no parseable structured output");
    }
    return response.parsed_output as T;
  },
};

export { EMPTY_USAGE };

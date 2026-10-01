import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ModelOption } from "../types";
import type { JsonRequest, ProviderAdapter, StreamRequest, StreamResult } from "./types";

function client(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/** models.list returns the whole catalog, most of which cannot hold a conversation. */
const NOT_CHAT =
  /(embedding|tts|whisper|audio|image|dall|moderation|transcribe|realtime|search|sora|codex-mini|babbage|davinci)/;

export const openaiAdapter: ProviderAdapter = {
  id: "openai",
  label: "OpenAI",
  keyVar: "OPENAI_API_KEY",

  isConfigured: () => Boolean(process.env.OPENAI_API_KEY),

  modelPreference: [/^gpt-5[\d.]*$/, /^gpt-5/, /^o[34]$/, /^gpt-4\.1$/, /^gpt-4o$/],
  utilityPreference: [/mini$/, /^gpt-5-mini/, /^gpt-4o-mini/, /mini/],

  async listModels(): Promise<ModelOption[]> {
    const models: ModelOption[] = [];
    for await (const model of client().models.list()) {
      if (NOT_CHAT.test(model.id)) continue;
      if (!/^(gpt|o\d|chatgpt)/.test(model.id)) continue;
      models.push({ id: model.id, label: model.id });
    }
    return models.sort((a, b) => a.id.localeCompare(b.id));
  },

  async streamText(request: StreamRequest): Promise<StreamResult> {
    // No temperature and no reasoning_effort: both are rejected by some models
    // in this catalog, and a 400 on one panelist is worse than a tuning knob.
    const stream = await client().chat.completions.create(
      {
        model: request.model,
        stream: true,
        stream_options: { include_usage: true },
        max_completion_tokens: request.maxTokens,
        messages: [
          { role: "system", content: request.system },
          ...request.messages.map((turn) => ({ role: turn.role, content: turn.content }) as const),
        ],
      },
      { signal: request.signal },
    );

    let text = "";
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        text += delta;
        request.onDelta(delta);
      }
      if (chunk.usage) {
        usage.input = chunk.usage.prompt_tokens ?? 0;
        usage.output = chunk.usage.completion_tokens ?? 0;
        usage.cacheRead = chunk.usage.prompt_tokens_details?.cached_tokens ?? 0;
      }
    }

    return { text, usage };
  },

  async generateJson<T>(request: JsonRequest<T>): Promise<T> {
    const response = await client().chat.completions.parse(
      {
        model: request.model,
        max_completion_tokens: request.maxTokens,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
        response_format: zodResponseFormat(request.schema, request.schemaName),
      },
      { signal: request.signal },
    );

    const parsed = response.choices[0]?.message?.parsed;
    if (!parsed) {
      throw new Error("OpenAI returned no parseable structured output");
    }
    return parsed as T;
  },
};

import { GoogleGenAI } from "@google/genai";
import type { ModelOption } from "../types";
import type { JsonRequest, ProviderAdapter, StreamRequest, StreamResult } from "./types";

function client(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
}

/** Gemini names the assistant side "model" rather than "assistant". */
function toContents(request: StreamRequest) {
  return request.messages.map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));
}

export const googleAdapter: ProviderAdapter = {
  id: "google",
  label: "Google",
  keyVar: "GOOGLE_API_KEY",

  isConfigured: () => Boolean(process.env.GOOGLE_API_KEY),

  modelPreference: [/gemini-3.*pro/, /gemini-[\d.]+-pro$/, /pro$/, /gemini/],
  utilityPreference: [/flash-lite/, /flash$/, /flash/],

  async listModels(): Promise<ModelOption[]> {
    const models: ModelOption[] = [];
    const pager = await client().models.list({ config: { queryBase: true, pageSize: 100 } });

    for await (const model of pager) {
      const id = (model.name ?? "").replace(/^models\//, "");
      if (!id) continue;
      if (model.supportedActions && !model.supportedActions.includes("generateContent")) continue;
      if (/embedding|aqa|imagen|veo|tts|image|live|native-audio/.test(id)) continue;
      models.push({ id, label: model.displayName ?? id });
    }

    return models.sort((a, b) => a.id.localeCompare(b.id));
  },

  async streamText(request: StreamRequest): Promise<StreamResult> {
    const stream = await client().models.generateContentStream({
      model: request.model,
      contents: toContents(request),
      config: {
        systemInstruction: request.system,
        maxOutputTokens: request.maxTokens,
        abortSignal: request.signal,
      },
    });

    let text = "";
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

    for await (const chunk of stream) {
      const delta = chunk.text;
      if (delta) {
        text += delta;
        request.onDelta(delta);
      }
      if (chunk.usageMetadata) {
        usage.input = chunk.usageMetadata.promptTokenCount ?? 0;
        usage.output =
          (chunk.usageMetadata.candidatesTokenCount ?? 0) +
          (chunk.usageMetadata.thoughtsTokenCount ?? 0);
        usage.cacheRead = chunk.usageMetadata.cachedContentTokenCount ?? 0;
      }
    }

    return { text, usage };
  },

  async generateJson<T>(request: JsonRequest<T>): Promise<T> {
    const response = await client().models.generateContent({
      model: request.model,
      contents: [{ role: "user", parts: [{ text: request.prompt }] }],
      config: {
        systemInstruction: request.system,
        maxOutputTokens: request.maxTokens,
        responseMimeType: "application/json",
        abortSignal: request.signal,
      },
    });

    const raw = response.text;
    if (!raw) {
      throw new Error("Google returned no structured output");
    }
    return request.schema.parse(JSON.parse(stripFence(raw)));
  },
};

/** Gemini honours the JSON mime type but still fences the payload now and then. */
function stripFence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

import { GoogleGenAI } from "@google/genai";

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY as string,
});

export const TEXT_MODEL = "gemini-3-flash-preview";
export const IMAGE_MODEL = "gemini-2.5-flash-image";

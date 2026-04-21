/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Megaphone, Newspaper, Instagram, Rocket, Info, AlertCircle, Loader2, Camera } from 'lucide-react';
import { ai, TEXT_MODEL, IMAGE_MODEL } from './lib/gemini';
import { Type } from '@google/genai';

interface MarketingAsset {
  medium: string;
  icon: React.ReactNode;
  prompt: string;
  imageUrl: string | null;
  status: 'idle' | 'generating-prompt' | 'generating-image' | 'ready' | 'error';
  error?: string;
}

const MEDIUMS = [
  { id: 'billboard', name: 'Billboard Ad', icon: <Megaphone className="w-5 h-5 text-blue-500" /> },
  { id: 'newspaper', name: 'Newspaper Print', icon: <Newspaper className="w-5 h-5 text-gray-600" /> },
  { id: 'social', name: 'Social Post', icon: <Instagram className="w-5 h-5 text-pink-500" /> },
];

export default function App() {
  const [productDescription, setProductDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [assets, setAssets] = useState<MarketingAsset[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const generateMaterials = async () => {
    if (!productDescription.trim()) return;

    setIsGenerating(true);
    setGlobalError(null);
    setAssets(MEDIUMS.map(m => ({
      medium: m.name,
      icon: m.icon,
      prompt: '',
      imageUrl: null,
      status: 'generating-prompt',
    })));

    try {
      // Step 1: Generate expanded consistent prompts using Gemini Flash
      const promptResponse = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: [
          {
            role: 'user',
            parts: [{
              text: `You are a professional creative director. Based on this product description: "${productDescription}", generate 3 detailed image generation prompts for different marketing mediums: Billboard, Newspaper, and Social Media.
              
              CRITICAL CONSTRAINTS:
              1. Maintain STRICT product consistency. Describe the product's color, material, texture, and unique branding features identically across all 3 prompts.
              2. DO NOT INCLUDE ANY PEOPLE, HUMANS, OR BODY PARTS. The images must be completely empty of people.
              3. Medium-specific styles:
                 - Billboard: Dramatic low-angle shot, cinematic lighting, impressive scale, high-quality background (e.g., majestic mountains or clean architectural space).
                 - Newspaper: High-contrast black and white, slightly grainy texture, classic editorial composition, focus on crisp details and shadows.
                 - Social Post: Modern lifestyle context, trendy color palette, soft natural lighting (e.g., sunlight through a window on a marble table), clean aesthetic.
              
              Respond ONLY with a JSON array of 3 objects, each with "medium" (one of: Billboard, Newspaper, Social) and "prompt" keys.`
            }]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                medium: { type: Type.STRING },
                prompt: { type: Type.STRING },
              },
              required: ['medium', 'prompt'],
            },
          },
        }
      });

      const expandedPrompts = JSON.parse(promptResponse.text || '[]');
      
      if (!expandedPrompts.length) throw new Error('Failed to generate prompts');

      // Update assets with prompts and start image generation
      setAssets(prev => prev.map(asset => {
        const expanded = expandedPrompts.find((p: any) => p.medium.toLowerCase().includes(asset.medium.toLowerCase().split(' ')[0].toLowerCase()));
        return {
          ...asset,
          prompt: expanded?.prompt || `A high-quality studio shot of ${productDescription}. No people.`,
          status: 'generating-image',
        };
      }));

      // Step 2: Generate images in parallel
      const generationPromises = expandedPrompts.map(async (p: any, index: number) => {
        try {
          const imageResponse = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: {
              parts: [{ text: p.prompt }]
            }
          });

          // Find the image part in the response
          let imageUrl = '';
          for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
              imageUrl = `data:image/png;base64,${part.inlineData.data}`;
              break;
            }
          }

          if (!imageUrl) throw new Error('No image returned');

          setAssets(prev => {
            const newAssets = [...prev];
            // Find the asset by medium name (rough matching)
            const assetIndex = newAssets.findIndex(a => a.medium.toLowerCase().includes(p.medium.toLowerCase().split(' ')[0].toLowerCase()));
            if (assetIndex !== -1) {
              newAssets[assetIndex] = {
                ...newAssets[assetIndex],
                imageUrl,
                status: 'ready',
              };
            }
            return newAssets;
          });
        } catch (err: any) {
          console.error(`Error generating image for ${p.medium}:`, err);
          setAssets(prev => {
            const newAssets = [...prev];
            const assetIndex = newAssets.findIndex(a => a.medium.toLowerCase().includes(p.medium.toLowerCase().split(' ')[0].toLowerCase()));
            if (assetIndex !== -1) {
              newAssets[assetIndex] = {
                ...newAssets[assetIndex],
                status: 'error',
                error: 'Generation failed',
              };
            }
            return newAssets;
          });
        }
      });

      await Promise.all(generationPromises);

    } catch (err: any) {
      console.error('Master generation error:', err);
      setGlobalError(err.message || 'Something went wrong during generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#F9FAFB] text-[#111827] font-sans">
      {/* Header */}
      <header className="h-16 px-8 flex items-center justify-between border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
            <div className="w-4 h-4 bg-white rounded-full"></div>
          </div>
          <span className="font-bold tracking-tight text-lg">Marketing Materials Generator</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-sm font-medium text-gray-500 hidden sm:inline">Engine: nano-banana</span>
          <button className="px-5 py-2 bg-black text-white text-sm font-medium rounded-full hover:bg-gray-800 transition-colors">
            Export All
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* Sidebar */}
        <aside className="w-full md:w-[360px] bg-white border-r border-gray-200 p-8 flex flex-col gap-8 overflow-y-auto">
          <div className="space-y-4">
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-400">Product Description</label>
            <textarea
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              placeholder="e.g. A minimalist glass water bottle with a bamboo lid..."
              className="w-full min-h-[160px] p-4 text-sm bg-gray-50 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-1 focus:ring-black transition-all"
            />
          </div>

          <div className="space-y-4">
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-400">Target Mediums</label>
            <div className="grid grid-cols-1 gap-2">
              {MEDIUMS.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-lg group">
                  <div className="flex items-center gap-3">
                    <div className="text-gray-400 group-hover:text-black transition-colors">{m.icon}</div>
                    <span className="text-sm font-medium">{m.name}</span>
                  </div>
                  <div className="w-4 h-4 rounded-full border-4 border-black"></div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-8 border-t border-gray-100">
            <button
              onClick={generateMaterials}
              disabled={isGenerating || !productDescription.trim()}
              className="w-full py-4 bg-black text-white font-bold rounded-xl text-sm tracking-wide hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Visuals
                </>
              )}
            </button>
            {globalError && (
              <p className="mt-4 text-xs text-red-50 font-medium bg-red-500 p-2 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-3 h-3" />
                {globalError}
              </p>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-8 overflow-y-auto">
          {assets.length === 0 && !isGenerating ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-6">
                <Rocket className="w-10 h-10 text-gray-300" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Ready to Imagine</h2>
              <p className="text-gray-500 text-sm leading-relaxed">
                Enter your product details in the sidebar to generate high-fidelity 
                marketing materials across billboards, print, and social media.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {assets.map((asset, index) => (
                <motion.div
                  key={asset.medium}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col shadow-sm hover:border-gray-300 transition-all"
                >
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Marketing Medium</span>
                      <span className="text-sm font-bold text-gray-900">{asset.medium}</span>
                    </div>
                    {asset.status === 'ready' && (
                      <span className="text-[10px] bg-gray-100 px-2 py-1 rounded font-bold text-gray-600 uppercase tracking-wider">Ready</span>
                    )}
                  </div>

                  <div className="flex-1 bg-gray-50 rounded-xl relative overflow-hidden flex items-center justify-center min-h-[300px] border border-gray-100">
                    {asset.status === 'generating-prompt' || asset.status === 'generating-image' ? (
                      <div className="flex flex-col items-center gap-4">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-full border-2 border-gray-200 border-t-black animate-spin" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-2 h-2 bg-black rounded-full animate-pulse" />
                          </div>
                        </div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                          {asset.status === 'generating-prompt' ? 'Contextualizing...' : 'Generating...'}
                        </span>
                      </div>
                    ) : asset.imageUrl ? (
                      <img
                        src={asset.imageUrl}
                        alt={asset.medium}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : asset.status === 'error' ? (
                      <div className="flex flex-col items-center gap-2 text-gray-300">
                        <AlertCircle className="w-8 h-8" />
                        <span className="text-xs font-medium">{asset.error}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-50">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Creative Direction</p>
                    <p className="text-xs text-gray-500 leading-relaxed italic line-clamp-2">
                       {asset.prompt ? `"${asset.prompt}"` : 'Awaiting prompt...'}
                    </p>
                  </div>
                </motion.div>
              ))}

              {/* Status/Info Card if generating */}
              {isGenerating && (
                <div className="bg-black text-white rounded-2xl p-8 flex flex-col justify-center items-center text-center min-h-[300px]">
                  <div className="w-16 h-16 rounded-full border-2 border-white/20 flex items-center justify-center mb-6">
                    <div className="w-8 h-8 bg-white rounded-full animate-pulse"></div>
                  </div>
                  <h2 className="text-xl font-bold mb-2">Consistency Engine Active</h2>
                  <p className="text-gray-400 text-sm max-w-[240px] leading-relaxed">
                    nano-banana is mapping product geometry and maintaining material integrity across all environments.
                  </p>
                  <div className="mt-6 flex gap-2">
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

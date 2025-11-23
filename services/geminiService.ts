import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.API_KEY || '';

// Helper: Validate API Key
const getAI = () => {
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('AIza...')) {
    throw new Error("API Key Google Gemini belum dikonfigurasi atau tidak valid. Silakan cek pengaturan Environment Variable di Vercel.");
  }
  return new GoogleGenAI({ apiKey });
};

// Helper: Retry Logic for 429 Errors
async function retryOperation<T>(operation: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const msg = error.message || '';
    if (retries > 0 && (msg.includes("429") || msg.includes("Quota") || msg.includes("RESOURCE_EXHAUSTED"))) {
      console.warn(`Quota hit. Retrying in ${delayMs}ms... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return retryOperation(operation, retries - 1, delayMs * 2);
    }
    throw error;
  }
}

// Helper: Compress Image for Mobile Optimization (Max 512px, JPEG 0.7)
const compressImage = (file: File | Blob): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX_SIZE = 512; // Keep it small for token efficiency

      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Gagal kompresi gambar"));
        },
        'image/jpeg',
        0.7
      );
    };

    reader.readAsDataURL(file);
  });
};

export const fileToGenerativePart = async (file: File | Blob): Promise<string> => {
  try {
    const compressedBlob = await compressImage(file);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const base64Data = base64String.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(compressedBlob);
    });
  } catch (error) {
    console.error("Image processing error:", error);
    throw new Error("Gagal memproses gambar. Pastikan format didukung.");
  }
};

export const visualizeRoom = async (imageBase64: string, prompt: string, maskBase64?: string) => {
  return retryOperation(async () => {
    try {
      const ai = getAI();
      // Visualizer needs image generation model
      const model = 'gemini-2.5-flash-image';
      
      const parts: any[] = [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBase64
          }
        }
      ];

      let textPrompt = "";

      if (maskBase64) {
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: maskBase64
          }
        });
        
        textPrompt = `Inpaint red area: ${prompt}. Keep rest identical.`;
      } else {
        textPrompt = `Redesign room: ${prompt}. Photorealistic.`;
      }

      parts.push({ text: textPrompt });

      const response = await ai.models.generateContent({
        model: model,
        contents: { parts },
      });

      return response;
    } catch (error: any) {
      console.error("Visualization Error:", error);
      throw new Error(error.message || "Gagal memproses visualisasi.");
    }
  });
};

export const detectMaterials = async (imageBase64: string) => {
  return retryOperation(async () => {
    try {
      const ai = getAI();
      // Use 1.5-flash (High TPM limit: 1M) instead of 2.5-flash (Low TPM limit: 250)
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
            { text: "Analisa material & kerusakan. JSON output: detectedMaterial, condition, suggestion, ahspSuggestion." }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedMaterial: { type: Type.STRING },
              condition: { type: Type.STRING },
              suggestion: { type: Type.STRING },
              ahspSuggestion: { type: Type.STRING }
            }
          }
        }
      });
      return JSON.parse(response.text || "{}");
    } catch (error: any) {
      console.error("Material Detection Error:", error);
      throw new Error(error.message || "Gagal mendeteksi material.");
    }
  });
};

export const findStores = async (query: string, location: { lat: number; long: number } | string) => {
  return retryOperation(async () => {
    try {
      const ai = getAI();
      let locationPrompt = "";
      let toolConfig = undefined;

      if (typeof location === 'object' && location !== null) {
          toolConfig = {
            retrievalConfig: {
              latLng: {
                latitude: location.lat,
                longitude: location.long
              }
            }
          };
      } else if (typeof location === 'string' && location.trim() !== "") {
          locationPrompt = ` di sekitar ${location}`;
      }

      // CRITICAL FIX: Use 'gemini-1.5-flash' instead of 'gemini-2.5-flash'
      // gemini-2.5-flash has a very low TPM limit on free tier (approx 250 tokens/min).
      // gemini-1.5-flash has ~1,000,000 tokens/min.
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash', 
        contents: `List 5 toko bangunan${locationPrompt} jual: ${query}. Format: Nama|Alamat|Rating|Jarak`,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: toolConfig
        }
      });
      
      return response;
    } catch (error: any) {
      console.error("Store Finder Error:", error);
      throw new Error(error.message || "Gagal mencari toko.");
    }
  });
};
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";

const apiKey = process.env.API_KEY || '';

// Helper: Validate API Key
const getAI = () => {
  // Simple check: ensure key exists and is not a placeholder
  if (!apiKey || apiKey.trim() === '' || apiKey === 'API_KEY_KAMU_DISINI') {
    throw new Error("API Key belum diset. Pastikan API_KEY ada di Environment Variables Vercel.");
  }
  return new GoogleGenAI({ apiKey });
};

// Helper: Retry Logic
async function retryOperation<T>(operation: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const msg = error.message || '';
    // Retry on Quota/Rate Limit or Server Errors
    if (retries > 0 && (msg.includes("429") || msg.includes("Quota") || msg.includes("503") || msg.includes("500"))) {
      console.warn(`Retrying AI request... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return retryOperation(operation, retries - 1, delayMs * 2);
    }
    throw error;
  }
}

// Helper: Compress Image (Max 512px)
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
      const MAX_SIZE = 512; 

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
    throw new Error("Gagal memproses gambar.");
  }
};

export const visualizeRoom = async (imageBase64: string, prompt: string, maskBase64?: string) => {
  return retryOperation(async () => {
    try {
      const ai = getAI();
      
      // FIX 1: Use 'gemini-2.0-flash-exp' which supports image gen and has better free limits
      // than gemini-2.5-flash-image (Preview).
      const model = 'gemini-2.0-flash-exp';
      
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
        // Masking flow
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: maskBase64
          }
        });
        textPrompt = `Edit the image based on this instruction: ${prompt}. Only change the masked area.`;
      } else {
        // Full redesign flow
        textPrompt = `Redesign this room/building. Style/Instruction: ${prompt}. Photorealistic, high quality.`;
      }

      parts.push({ text: textPrompt });

      const response = await ai.models.generateContent({
        model: model,
        contents: { parts },
        config: {
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ]
        }
      });

      return response;
    } catch (error: any) {
      console.error("Visualization Error:", error);
      throw new Error(error.message || "Gagal memproses visualisasi.");
    }
  });
};

export const visualizeRoomAdvice = async (imageBase64: string, prompt: string) => {
    return retryOperation(async () => {
        try {
            const ai = getAI();
            const response = await ai.models.generateContent({
                model: 'gemini-1.5-flash',
                contents: {
                    parts: [
                        { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
                        { text: `Saya ingin merenovasi ruangan ini. Permintaan saya: "${prompt}".
                          Berikan saran renovasi mendetail (Arsitektural & Interior).
                          Format output:
                          1. Konsep Desain
                          2. Rekomendasi Material
                          3. Pencahayaan
                          4. Estimasi Tahapan Pekerjaan`
                        }
                    ]
                }
            });
            return response.text || "Tidak ada saran yang dihasilkan.";
        } catch (error: any) {
            console.error("Advice Error:", error);
            throw new Error("Gagal mendapatkan saran renovasi.");
        }
    });
};

export const detectMaterials = async (imageBase64: string) => {
  return retryOperation(async () => {
    try {
      const ai = getAI();
      // FIX 2: Use gemini-1.5-flash (High TPM)
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
            { text: "Analisa material bangunan di foto ini. Identifikasi kerusakan jika ada. Output JSON: detectedMaterial, condition, suggestion, ahspSuggestion (nama item pekerjaan terkait)." }
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
      
      let locationText = "";
      if (typeof location === 'string') {
        locationText = location;
      } else {
        locationText = `koordinat ${location.lat},${location.long}`;
      }

      // FIX 3: Remove googleMaps tool to avoid billing/quota complexity on Free Tier.
      // Use pure text knowledge generation with gemini-1.5-flash (High Quota).
      const prompt = `Cari rekomendasi toko bangunan atau supplier material di sekitar ${locationText} yang menjual: "${query}". 
      Berikan 5 rekomendasi.
      Format output per baris: Nama Toko|Alamat Singkat|Estimasi Jarak/Lokasi|Jam Buka (jika tahu).
      Contoh: Toko Abadi|Jl. Raya No.1|1 km|08:00-17:00`;

      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash', 
        contents: prompt
      });
      
      return response;
    } catch (error: any) {
      console.error("Store Finder Error:", error);
      throw new Error(error.message || "Gagal mencari toko.");
    }
  });
};
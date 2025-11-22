import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helper to convert file/blob to base64
export const fileToGenerativePart = async (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:image/jpeg;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const visualizeRoom = async (imageBase64: string, prompt: string, maskBase64?: string) => {
  try {
    // Using gemini-2.5-flash-image as it supports masking tasks well
    const model = 'gemini-2.5-flash-image';
    
    const parts: any[] = [
      {
        inlineData: {
          mimeType: 'image/png',
          data: imageBase64
        }
      }
    ];

    let textPrompt = "";

    if (maskBase64) {
      // If a mask is provided, send it as a second image part
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: maskBase64
        }
      });
      
      // EXTREMELY STRICT PROMPT for Inpainting/Masking
      textPrompt = `Task: Object Insertion / Inpainting.
      
      Input 1: Original Image.
      Input 2: Mask Image (Red area indicates where to generate content).
      
      Instruction: ${prompt} inside the red masked area.
      
      Rules:
      1. STRICTLY only alter pixels corresponding to the red area in the mask.
      2. The rest of the image MUST remain pixel-perfect identical to the original.
      3. Blend the new content naturally with the lighting and perspective of the original scene.
      4. If the prompt asks to add an object, scale it to fit the red mask area.`;
    } else {
      // Standard full image generation
      textPrompt = `Act as an AI Architect and Interior Decorator. 
      Instruction: ${prompt}. 
      Return a high-quality, realistic image visualization of the result. 
      Focus on architectural accuracy and lighting. Preserve the original perspective exactly.`;
    }

    parts.push({ text: textPrompt });

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts },
    });

    return response;
  } catch (error) {
    console.error("Visualization Error:", error);
    throw error;
  }
};

export const detectMaterials = async (imageBase64: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
          { text: "Analisa gambar konstruksi ini. Identifikasi material dinding/lantai yang terlihat dan kondisinya. Jika ada kerusakan, sarankan perbaikan teknis (misal: butuh plesteran 1:3). Berikan output singkat dalam format JSON." }
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
            ahspSuggestion: { type: Type.STRING, description: "Saran nama item pekerjaan untuk RAB" }
          }
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Material Detection Error:", error);
    throw error;
  }
};

export const findStores = async (query: string, location: { lat: number; long: number } | string) => {
  try {
    let locationPrompt = "";
    let toolConfig = undefined;

    if (typeof location === 'object' && location !== null) {
        // GPS Mode: Use strict retrieval config
        toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: location.lat,
              longitude: location.long
            }
          }
        };
    } else if (typeof location === 'string' && location.trim() !== "") {
        // Manual Mode: Add location to prompt text
        locationPrompt = ` di sekitar ${location}`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Carikan 5 toko bangunan atau supplier material${locationPrompt} yang menjual: ${query}.
      
      Instruksi Output:
      Berikan respons hanya dalam format daftar teks dengan pemisah PIPE (|) untuk setiap toko pada baris baru.
      Format per baris: Nama Toko | Alamat Lengkap | Rating (Angka) | Jarak (estimasi)
      
      Contoh:
      TB. Maju Jaya | Jl. Sudirman No. 1, Jakarta | 4.5 | 2.1 km
      Sinar Bangunan | Jl. Thamrin No. 5, Jakarta | 4.8 | 3.5 km
      
      Jangan tambahkan teks pembuka, penutup, atau markdown bold (**). Bersih hanya data.`,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: toolConfig
      }
    });
    
    return response;
  } catch (error) {
    console.error("Store Finder Error:", error);
    throw error;
  }
};
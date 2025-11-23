import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.API_KEY || '';

// Helper: Validate API Key
const getAI = () => {
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('AIza...')) {
    throw new Error("API Key Google Gemini belum dikonfigurasi atau tidak valid. Silakan cek pengaturan Environment Variable di Vercel.");
  }
  return new GoogleGenAI({ apiKey });
};

// Helper: Compress Image for Mobile Optimization (Max 512px, JPEG 0.7)
// Mengurangi ukuran ke 512px sangat membantu menghindari limit Token Per Minute (TPM) di Free Tier
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
      const MAX_SIZE = 512; // Diturunkan dari 1024 ke 512 agar hemat token

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
        0.7 // Quality 70%
      );
    };

    reader.readAsDataURL(file);
  });
};

// Helper to convert file/blob to base64 with compression
export const fileToGenerativePart = async (file: File | Blob): Promise<string> => {
  try {
    // Compress image first to avoid "Payload Too Large" or timeouts on mobile
    const compressedBlob = await compressImage(file);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        // Remove data url prefix (e.g. "data:image/jpeg;base64,")
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
  try {
    const ai = getAI();
    // Visualizer butuh kemampuan editing gambar, tetap pakai 2.5-flash-image
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
      // If a mask is provided, send it as a second image part
      parts.push({
        inlineData: {
          mimeType: 'image/png', // Mask remains PNG
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
  } catch (error: any) {
    console.error("Visualization Error:", error);
    throw new Error(error.message || "Gagal memproses visualisasi.");
  }
};

export const detectMaterials = async (imageBase64: string) => {
  try {
    const ai = getAI();
    // Menggunakan gemini-1.5-flash untuk text-only analysis karena lebih stabil & hemat kuota dibanding 2.5
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
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
  } catch (error: any) {
    console.error("Material Detection Error:", error);
    throw new Error(error.message || "Gagal mendeteksi material.");
  }
};

export const findStores = async (query: string, location: { lat: number; long: number } | string) => {
  try {
    const ai = getAI();
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
  } catch (error: any) {
    console.error("Store Finder Error:", error);
    throw new Error(error.message || "Gagal mencari toko.");
  }
};
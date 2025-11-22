export enum AppView {
  HOME = 'HOME',
  VISUALIZER = 'VISUALIZER',
  RAB = 'RAB',
  TOOLS = 'TOOLS'
}

export interface Material {
  id: string;
  name: string;
  unit: string;
  price: number;
  category: 'material' | 'upah';
}

export interface AHSPItem {
  id: string;
  category: string;
  name: string;
  unit: string;
  components: {
    materialId: string;
    coefficient: number;
  }[];
}

export interface RABItem {
  id: string;
  description: string; // Uraian Kegiatan
  volume: number;
  unit: string;
  unitPrice: number;
  totalPrice: number; // Calculated (vol * price)
}

export interface RABSection {
  id: string;
  name: string; // e.g., "I. PEKERJAAN PERSIAPAN"
  items: RABItem[];
}

export interface StoreResult {
  name: string;
  address: string;
  rating?: string;
  openNow?: boolean;
}
import { Material, AHSPItem } from './types';

export const MATERIALS_DB: Material[] = [
  { id: 'm1', name: 'Semen Portland (50kg)', unit: 'zak', price: 65000, category: 'material' },
  { id: 'm2', name: 'Pasir Pasang', unit: 'm3', price: 250000, category: 'material' },
  { id: 'm3', name: 'Batu Kali', unit: 'm3', price: 300000, category: 'material' },
  { id: 'm4', name: 'Bata Merah', unit: 'bh', price: 800, category: 'material' },
  { id: 'm5', name: 'Cat Tembok Interior', unit: 'kg', price: 35000, category: 'material' },
  { id: 'm6', name: 'Paku Biasa', unit: 'kg', price: 18000, category: 'material' },
  { id: 'u1', name: 'Pekerja', unit: 'oh', price: 120000, category: 'upah' },
  { id: 'u2', name: 'Tukang Batu', unit: 'oh', price: 150000, category: 'upah' },
  { id: 'u3', name: 'Kepala Tukang', unit: 'oh', price: 170000, category: 'upah' },
  { id: 'u4', name: 'Mandor', unit: 'oh', price: 180000, category: 'upah' },
];

export const AHSP_DB: AHSPItem[] = [
  {
    id: 'a1',
    category: 'Pondasi',
    name: 'Pasangan Pondasi Batu Kali 1:4',
    unit: 'm3',
    components: [
      { materialId: 'm3', coefficient: 1.2 },
      { materialId: 'm1', coefficient: 3.26 }, // zak
      { materialId: 'm2', coefficient: 0.52 },
      { materialId: 'u1', coefficient: 1.5 },
      { materialId: 'u2', coefficient: 0.75 },
    ]
  },
  {
    id: 'a2',
    category: 'Dinding',
    name: 'Pasangan Dinding Bata Merah 1:4',
    unit: 'm2',
    components: [
      { materialId: 'm4', coefficient: 70 },
      { materialId: 'm1', coefficient: 0.23 },
      { materialId: 'm2', coefficient: 0.043 },
      { materialId: 'u1', coefficient: 0.3 },
      { materialId: 'u2', coefficient: 0.1 },
    ]
  },
  {
    id: 'a3',
    category: 'Plesteran',
    name: 'Plesteran 1:4 Tebal 15mm',
    unit: 'm2',
    components: [
      { materialId: 'm1', coefficient: 0.12 },
      { materialId: 'm2', coefficient: 0.024 },
      { materialId: 'u1', coefficient: 0.3 },
      { materialId: 'u2', coefficient: 0.15 },
    ]
  },
  {
    id: 'a4',
    category: 'Pengecatan',
    name: 'Pengecatan Tembok Baru (1 Lapis Plamir, 1 Lapis Dasar, 2 Lapis Penutup)',
    unit: 'm2',
    components: [
      { materialId: 'm5', coefficient: 0.2 }, // kg simplified
      { materialId: 'u1', coefficient: 0.02 },
      { materialId: 'u2', coefficient: 0.063 },
    ]
  }
];

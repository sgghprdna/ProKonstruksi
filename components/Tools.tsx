import React, { useState } from 'react';
import { MapPin, Loader2, Star, Navigation, X, Store, Info, Search, AlertTriangle } from 'lucide-react';
import { findStores } from '../services/geminiService';

interface StoreData {
  name: string;
  address: string;
  rating: string;
  distance: string;
  uri?: string;
}

const Tools: React.FC = () => {
  const [storeQuery, setStoreQuery] = useState('');
  const [storeResults, setStoreResults] = useState<StoreData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);
  
  // Location Mode: 'gps' or 'manual'
  const [searchMode, setSearchMode] = useState<'gps' | 'manual'>('gps');
  const [manualLocation, setManualLocation] = useState('');

  const processResponse = (response: any) => {
      // 1. Get Grounding Chunks (Maps Metadata)
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const mapChunks = chunks
        .filter((c: any) => c.maps?.uri)
        .map((c: any) => ({
            title: c.maps.title,
            uri: c.maps.uri
        }));

      // 2. Parse Text Response (Expected format: Name | Address | Rating | Distance)
      const text = response.text || '';
      const lines = (text as string).split('\n');
      const parsedStores: StoreData[] = [];

      lines.forEach((line: string) => {
          const parts = line.split('|');
          if (parts.length >= 2) { // At least Name and Address
              const name = parts[0].trim().replace(/\*\*/g, ''); // Clean bold markdown if any
              
              // Find matching URI from chunks
              const matchedChunk = mapChunks.find((mc: any) => 
                  mc.title.toLowerCase().includes(name.toLowerCase()) || 
                  name.toLowerCase().includes(mc.title.toLowerCase())
              );

              parsedStores.push({
                  name: name,
                  address: parts[1]?.trim() || 'Alamat tidak tersedia',
                  rating: parts[2]?.trim() || '-',
                  distance: parts[3]?.trim() || '-',
                  uri: matchedChunk?.uri
              });
          }
      });
      
      // Fallback if parsing fails but chunks exist
      if (parsedStores.length === 0 && mapChunks.length > 0) {
          mapChunks.forEach((mc: any) => {
              parsedStores.push({
                  name: mc.title,
                  address: 'Lihat di peta',
                  rating: '-',
                  distance: '-',
                  uri: mc.uri
              });
          });
      } else if (parsedStores.length === 0 && text) {
         // Total fallback if parsing fails completely
         setRawError(text);
      }

      setStoreResults(parsedStores);
  };

  const handleFindStore = async () => {
    if (!storeQuery) return;
    setIsLoading(true);
    setRawError(null);
    setStoreResults([]);
    
    try {
        if (searchMode === 'gps') {
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(async (position) => {
                try {
                  const response = await findStores(storeQuery, { 
                      lat: position.coords.latitude, 
                      long: position.coords.longitude 
                  });
                  processResponse(response);
                } catch (error: any) {
                  let msg = error.message || 'Gagal mencari toko via GPS.';
                  if (msg.includes("429") || msg.includes("Quota") || msg.includes("RESOURCE_EXHAUSTED")) {
                      msg = "Kuota AI Google Gemini sedang penuh. Silakan coba lagi nanti.";
                  }
                  setRawError(msg);
                } finally {
                  setIsLoading(false);
                }
              }, (err) => {
                console.error(err);
                setRawError("Gagal mendeteksi lokasi. Pastikan GPS aktif atau gunakan Lokasi Manual.");
                setIsLoading(false);
              });
            } else {
                setRawError("Geolocation tidak didukung browser ini. Gunakan Lokasi Manual.");
                setIsLoading(false);
            }
        } else {
            // Manual Mode
            if (!manualLocation.trim()) {
                setRawError("Mohon masukkan nama lokasi (Kota/Kecamatan).");
                setIsLoading(false);
                return;
            }
            const response = await findStores(storeQuery, manualLocation);
            processResponse(response);
            setIsLoading(false);
        }
    } catch (error: any) {
        console.error(error);
        let msg = error.message || 'Terjadi kesalahan saat menghubungi AI.';
        if (msg.includes("429") || msg.includes("Quota") || msg.includes("RESOURCE_EXHAUSTED")) {
            msg = "Kuota AI Google Gemini sedang penuh. Silakan coba lagi nanti.";
        }
        setRawError(msg);
        setIsLoading(false);
    }
  };

  const openInMaps = (uri?: string, query?: string) => {
      if (uri) {
          window.open(uri, '_blank');
      } else if (query) {
          window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank');
      }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 relative">
      {/* Header */}
      <div className="bg-white px-4 py-4 shadow-sm sticky top-0 z-10 border-b border-gray-100">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Store className="text-indigo-600" size={20}/> Cari Material
        </h2>
        <p className="text-xs text-gray-500">Temukan supplier terbaik di sekitar Anda.</p>
      </div>

      {/* Search Area */}
      <div className="p-4 space-y-4 overflow-y-auto flex-1 pb-24">
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-200 space-y-3">
             {/* Main Search Input */}
             <div className="flex gap-2 items-center border-b border-gray-100 pb-2">
                 <div className="pl-2 text-gray-400">
                     <Store size={18} />
                 </div>
                 <input 
                    type="text" 
                    className="flex-1 p-2 text-sm outline-none text-slate-800 font-medium bg-transparent text-slate-800"
                    placeholder="Cari: Pasir, Semen, Cat..."
                    value={storeQuery}
                    onChange={(e) => setStoreQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleFindStore()}
                />
            </div>

            {/* Location Controls */}
            <div className="flex flex-col gap-2">
                <div className="flex gap-2 text-xs font-medium bg-gray-100 p-1 rounded-lg self-start">
                    <button 
                        onClick={() => setSearchMode('gps')}
                        className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${searchMode === 'gps' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <MapPin size={12} /> GPS Otomatis
                    </button>
                    <button 
                        onClick={() => setSearchMode('manual')}
                        className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${searchMode === 'manual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Search size={12} /> Lokasi Manual
                    </button>
                </div>
                
                {searchMode === 'manual' && (
                    <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                         <input 
                            type="text"
                            className="w-full p-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 focus:bg-white text-slate-800 transition-colors"
                            placeholder="Contoh: Tebet, Jakarta Selatan"
                            value={manualLocation}
                            onChange={(e) => setManualLocation(e.target.value)}
                        />
                    </div>
                )}
            </div>

            <button 
                onClick={handleFindStore}
                disabled={isLoading || !storeQuery}
                className="w-full bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 disabled:bg-gray-300 transition-all shadow-md shadow-indigo-200 flex justify-center items-center gap-2 font-bold text-sm"
            >
                {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Navigation size={18} className="fill-current" />}
                {isLoading ? 'Mencari...' : 'Cari Toko Terdekat'}
            </button>
        </div>

        {/* Error Display */}
        {rawError && (
            <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex gap-3 items-start animate-in slide-in-from-bottom-2">
                <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <div>
                    <h4 className="text-sm font-bold text-red-700 mb-1">Gagal Mencari</h4>
                    <p className="text-xs text-red-600 leading-relaxed whitespace-pre-wrap">{rawError}</p>
                </div>
            </div>
        )}

        {/* Results Grid */}
        <div className="grid grid-cols-1 gap-3">
            {storeResults.length > 0 ? (
                storeResults.map((store, idx) => (
                    <div 
                        key={idx} 
                        onClick={() => setSelectedStore(store)}
                        className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 active:scale-[0.98] transition-transform cursor-pointer flex justify-between items-center group"
                    >
                        <div className="flex-1">
                            <h4 className="font-bold text-slate-800 text-sm group-hover:text-indigo-600 transition-colors mb-1">{store.name}</h4>
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                                <span className="flex items-center gap-1 text-orange-500 font-bold bg-orange-50 px-1.5 py-0.5 rounded">
                                    <Star size={10} fill="currentColor"/> {store.rating}
                                </span>
                                <span>{store.distance}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-1 line-clamp-1">{store.address}</p>
                        </div>
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                openInMaps(store.uri, store.name);
                            }}
                            className="ml-3 bg-indigo-50 p-3 rounded-full text-indigo-600 border border-indigo-100 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all shadow-sm z-10"
                            title="Buka di Google Maps"
                        >
                             <Navigation size={18} className="fill-current" />
                        </button>
                    </div>
                ))
            ) : (
                !isLoading && !rawError && (
                    <div className="text-center py-10 px-4">
                        <div className="text-gray-400">
                            <MapPin size={40} className="mx-auto mb-2 opacity-20" />
                            <p className="text-sm">Cari toko bangunan atau material<br/>di sekitar lokasi Anda.</p>
                        </div>
                    </div>
                )
            )}
        </div>
      </div>

      {/* Detail Modal / Bottom Sheet */}
      {selectedStore && (
          <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
                  {/* Map Header Placeholder */}
                  <div className="h-24 bg-indigo-50 flex items-center justify-center relative">
                      <Store size={48} className="text-indigo-200" />
                      <button 
                        onClick={() => setSelectedStore(null)}
                        className="absolute top-3 right-3 bg-white/80 p-1.5 rounded-full text-gray-500 hover:bg-white shadow-sm"
                      >
                          <X size={16} />
                      </button>
                  </div>
                  
                  <div className="p-5">
                      <div className="flex justify-between items-start mb-4">
                          <div>
                              <h3 className="font-bold text-xl text-slate-800 leading-tight mb-1">{selectedStore.name}</h3>
                              <div className="flex items-center gap-2">
                                  <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1">
                                      <Star size={12} fill="currentColor"/> {selectedStore.rating}
                                  </span>
                                  <span className="text-xs text-gray-500">• {selectedStore.distance}</span>
                              </div>
                          </div>
                      </div>

                      <div className="space-y-3 mb-6">
                          <div className="flex gap-3 items-start">
                              <MapPin className="text-gray-400 mt-0.5 shrink-0" size={16} />
                              <p className="text-sm text-gray-600 leading-snug">{selectedStore.address}</p>
                          </div>
                      </div>

                      <button 
                          onClick={() => openInMaps(selectedStore.uri, selectedStore.name)}
                          className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                      >
                          <Navigation size={18} className="fill-current" /> Buka di Google Maps
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default Tools;
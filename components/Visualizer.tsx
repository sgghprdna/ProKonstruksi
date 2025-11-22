import React, { useRef, useState, useEffect, useCallback } from 'react';
import { 
  Camera, RefreshCw, Eraser, PenTool, Wand2, 
  ZoomIn, ZoomOut, Move, Image as ImageIcon, ArrowRight, 
  Download, ScanLine, Loader2, Info, TriangleAlert
} from 'lucide-react';
import { visualizeRoom, fileToGenerativePart, detectMaterials } from '../services/geminiService';

const Visualizer: React.FC = () => {
  // --- State: App Mode ---
  const [activeTab, setActiveTab] = useState<'visualizer' | 'scanner'>('visualizer');

  // --- State: Images ---
  const [image, setImage] = useState<string | null>(null); // Base64 source
  const [resultImage, setResultImage] = useState<string | null>(null); // Base64 result
  
  // --- State: Canvas & Drawing ---
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [brushSize, setBrushSize] = useState(50); 
  
  // --- State: Viewport (Zoom/Pan) ---
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [interactionMode, setInteractionMode] = useState<'draw' | 'move'>('draw');
  const [isDragging, setIsDragging] = useState(false);
  const lastPosition = useRef<{ x: number, y: number } | null>(null);

  // Pinch Zoom State
  const [initialPinchDist, setInitialPinchDist] = useState<number | null>(null);
  const [initialScale, setInitialScale] = useState<number>(1);

  // --- State: Logic ---
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // --- State: Scanner ---
  const [scanResult, setScanResult] = useState<any>(null);
  
  // --- Refs ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // --- Initialization ---

  const fitImageToScreen = useCallback(() => {
    if (imageRef.current && containerRef.current) {
        const img = imageRef.current;
        const container = containerRef.current;
        
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        if (containerWidth === 0 || containerHeight === 0) return;

        const imgWidth = img.naturalWidth || 1000;
        const imgHeight = img.naturalHeight || 1000;

        const scaleX = containerWidth / imgWidth;
        const scaleY = containerHeight / imgHeight;
        
        const initialScale = Math.min(scaleX, scaleY);
        
        setScale(initialScale);
        const scaledWidth = imgWidth * initialScale;
        const scaledHeight = imgHeight * initialScale;

        setOffset({ 
            x: (containerWidth - scaledWidth) / 2,
            y: (containerHeight - scaledHeight) / 2 
        });
    }
  }, []);

  useEffect(() => {
      if (image) {
          setTimeout(fitImageToScreen, 50);
      }
  }, [image, fitImageToScreen]);

  // Switch interaction mode when tab changes
  useEffect(() => {
      if (activeTab === 'scanner') {
          setInteractionMode('move');
      } else {
          setInteractionMode('draw');
      }
  }, [activeTab]);

  const onImageLoad = () => {
    if (canvasRef.current && imageRef.current) {
      const img = imageRef.current;
      canvasRef.current.width = img.naturalWidth;
      canvasRef.current.height = img.naturalHeight;
      
      fitImageToScreen();
      clearCanvas();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        // Compression is now handled in fileToGenerativePart
        const base64 = await fileToGenerativePart(e.target.files[0]);
        setImage(`data:image/jpeg;base64,${base64}`); // Use JPEG for compressed images
        setResultImage(null);
        setScanResult(null); // Reset scan
        setHasDrawn(false);
        setInteractionMode('draw');
        setPrompt('');
      } catch (error: any) {
        alert(error.message || "Gagal memuat gambar.");
      }
    }
  };

  // --- Interaction Logic ---

  const getCanvasCoordinates = (clientX: number, clientY: number) => {
    if (!canvasRef.current || !containerRef.current) return null;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const relativeX = clientX - containerRect.left;
    const relativeY = clientY - containerRect.top;

    const canvasX = (relativeX - offset.x) / scale;
    const canvasY = (relativeY - offset.y) / scale;

    return { x: canvasX, y: canvasY };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e && e.touches.length === 2) {
        const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        setInitialPinchDist(dist);
        setInitialScale(scale);
        return;
    }

    const clientX = 'touches' in e ? e.touches[0].clientX : e.nativeEvent.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.nativeEvent.clientY;

    // Force move mode if in Scanner tab or if Interaction Mode is move
    const effectiveMode = activeTab === 'scanner' ? 'move' : interactionMode;

    if (effectiveMode === 'move') {
        setIsDragging(true);
        lastPosition.current = { x: clientX, y: clientY };
    } else {
        setIsDrawing(true);
        const coords = getCanvasCoordinates(clientX, clientY);
        if (coords) draw(coords.x, coords.y);
    }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e && e.touches.length === 2 && initialPinchDist) {
        const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        const delta = dist / initialPinchDist;
        setScale(Math.min(Math.max(initialScale * delta, 0.1), 10)); 
        return;
    }

    const clientX = 'touches' in e ? e.touches[0].clientX : e.nativeEvent.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.nativeEvent.clientY;

    const effectiveMode = activeTab === 'scanner' ? 'move' : interactionMode;

    if (effectiveMode === 'move' && isDragging && lastPosition.current) {
        const dx = clientX - lastPosition.current.x;
        const dy = clientY - lastPosition.current.y;
        setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        lastPosition.current = { x: clientX, y: clientY };
    } 
    else if (effectiveMode === 'draw' && isDrawing) {
        e.preventDefault(); 
        const coords = getCanvasCoordinates(clientX, clientY);
        if (coords) draw(coords.x, coords.y);
    }
  };

  const handleEnd = () => {
    setIsDrawing(false);
    setIsDragging(false);
    setInitialPinchDist(null);
    
    const ctx = canvasRef.current?.getContext('2d');
    ctx?.beginPath();
    lastPosition.current = null;
  };

  const draw = (x: number, y: number) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    setHasDrawn(true);
    ctx.lineWidth = brushSize; 
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (tool === 'brush') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#FF0000'; 
    } else {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    }

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearCanvas = () => {
     const ctx = canvasRef.current?.getContext('2d');
     if (ctx && canvasRef.current) {
         ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
         setHasDrawn(false);
     }
  };

  const handleZoom = (delta: number) => {
    setScale(prev => Math.max(0.1, Math.min(prev + delta, 10)));
  };

  // --- Logic: Generator ---

  const handleGenerate = async () => {
    if (!image || !prompt) return;
    setIsLoading(true);
    try {
      const cleanBase64 = image.split(',')[1]; 
      let maskBase64 = undefined;
      if (hasDrawn && canvasRef.current) {
          maskBase64 = canvasRef.current.toDataURL('image/png').split(',')[1];
      }

      const response = await visualizeRoom(cleanBase64, prompt, maskBase64);
      
      let newImageBase64 = null;
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            newImageBase64 = part.inlineData.data;
          }
        }
      }

      if (newImageBase64) {
        setResultImage(`data:image/png;base64,${newImageBase64}`);
      } else {
        alert("Gagal mendapatkan gambar dari AI. Silakan coba lagi.");
      }

    } catch (error: any) {
      console.error(error);
      // Show explicit error message to user (e.g., "API Key missing")
      alert(`Gagal: ${error.message || "Terjadi kesalahan saat memproses."}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Logic: Scanner ---

  const handleScan = async () => {
      if (!image) return;
      setIsLoading(true);
      try {
          const cleanBase64 = image.split(',')[1];
          const result = await detectMaterials(cleanBase64);
          setScanResult(result);
      } catch (error: any) {
          console.error(error);
          alert(`Gagal: ${error.message || "Gagal menganalisa gambar."}`);
      } finally {
          setIsLoading(false);
      }
  };

  // --- Actions ---

  const handleContinueEdit = () => {
      if (resultImage) {
          setImage(resultImage);
          setResultImage(null);
          setHasDrawn(false);
          setInteractionMode('draw');
          setPrompt('');
          clearCanvas();
      }
  };

  const handleReset = () => {
    setResultImage(null);
    setScanResult(null);
    setInteractionMode('draw');
    clearCanvas();
  };

  const handleDownload = () => {
    const target = resultImage || image;
    if (target) {
        const link = document.createElement('a');
        link.href = target;
        link.download = `prokonstruksi-${activeTab}-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  };

  // --- Render ---

  return (
    <div className="flex flex-col h-full bg-gray-900 relative overflow-hidden">
      
      {/* 1. Header with Tabs */}
      <div className="bg-white/95 backdrop-blur px-4 py-3 shadow-md z-30 flex justify-between items-center shrink-0 relative">
        <div className="flex items-center gap-4">
            {/* Tab Switcher */}
            <div className="flex bg-gray-100 p-1 rounded-xl">
                <button 
                    onClick={() => setActiveTab('visualizer')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'visualizer' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Wand2 size={14} /> Visual
                </button>
                <button 
                    onClick={() => setActiveTab('scanner')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'scanner' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <ScanLine size={14} /> Scanner
                </button>
            </div>
        </div>
        
        {image && !resultImage && activeTab === 'visualizer' && (
            <div className="flex gap-3 items-center">
                <div className="flex bg-gray-50 rounded-full p-1 border border-gray-100 shadow-inner">
                    <button 
                        onClick={() => setInteractionMode(prev => prev === 'move' ? 'draw' : 'move')}
                        className={`p-2 rounded-full transition-all duration-200 ${interactionMode === 'move' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}
                        title={interactionMode === 'move' ? "Kembali ke Gambar" : "Geser / Zoom"}
                    >
                        <Move size={16} strokeWidth={2.5} />
                    </button>
                </div>
                
                {interactionMode === 'draw' && (
                    <div className="flex items-center bg-gray-50 rounded-full p-1 gap-1 border border-gray-100 shadow-inner">
                        <button 
                            onClick={() => setTool('brush')}
                            className={`p-2 rounded-full transition-all duration-200 ${tool === 'brush' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}
                            title="Brush"
                        >
                            <PenTool size={16} strokeWidth={2.5} />
                        </button>
                        <button 
                            onClick={() => setTool('eraser')}
                            className={`p-2 rounded-full transition-all duration-200 ${tool === 'eraser' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}
                            title="Eraser"
                        >
                            <Eraser size={16} strokeWidth={2.5} />
                        </button>
                    </div>
                )}
            </div>
        )}
      </div>

      {/* 2. Canvas Area */}
      <div className="absolute inset-0 top-[68px] bottom-[140px] bg-gray-900 overflow-hidden touch-none" ref={containerRef}>
        {!image ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-6">
             <div className="bg-gray-800/50 p-6 rounded-3xl border border-gray-700 max-w-xs w-full">
                 {activeTab === 'visualizer' ? <Wand2 className="w-16 h-16 text-indigo-400 mx-auto mb-4" /> : <ScanLine className="w-16 h-16 text-indigo-400 mx-auto mb-4" />}
                 <h3 className="text-white font-bold text-xl mb-2">
                    {activeTab === 'visualizer' ? 'Visualisasi AI' : 'Deteksi Material'}
                 </h3>
                 <p className="text-gray-400 text-xs mb-4">
                    {activeTab === 'visualizer' ? 'Ubah desain ruangan dalam sekejap.' : 'Analisa kerusakan dan saran perbaikan.'}
                 </p>
                 <div className="grid grid-cols-2 gap-3 mt-6">
                    <button onClick={() => cameraInputRef.current?.click()} className="flex flex-col items-center gap-2 bg-indigo-600 p-4 rounded-2xl text-white hover:bg-indigo-700 transition">
                        <Camera size={24} /> <span className="text-xs font-bold">Kamera</span>
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-2 bg-gray-700 p-4 rounded-2xl text-white hover:bg-gray-600 transition">
                        <ImageIcon size={24} /> <span className="text-xs font-bold">Galeri</span>
                    </button>
                 </div>
                 <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                 <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileChange} />
            </div>
          </div>
        ) : (
          <>
            {/* Transform Layer */}
            <div 
                className="origin-top-left w-full h-full"
                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
            >
                <div className="relative inline-block">
                    <img 
                        ref={imageRef}
                        src={image} 
                        alt="Base"
                        onLoad={onImageLoad}
                        className="pointer-events-none select-none max-w-none"
                    />
                    {resultImage && (
                         <img src={resultImage} alt="Result" className="absolute inset-0 w-full h-full pointer-events-none z-20 max-w-none"/>
                    )}
                    
                    {/* Masking Canvas - Only visible in Visualizer mode when no result */}
                    <canvas
                        ref={canvasRef}
                        className={`absolute inset-0 z-10 max-w-none ${resultImage || activeTab === 'scanner' ? 'hidden' : 'block'}`}
                        onMouseDown={handleStart}
                        onMouseMove={handleMove}
                        onMouseUp={handleEnd}
                        onMouseLeave={handleEnd}
                        onTouchStart={handleStart}
                        onTouchMove={handleMove}
                        onTouchEnd={handleEnd}
                        style={{ cursor: interactionMode === 'move' ? 'move' : 'crosshair' }}
                    />
                    
                    {/* Scan Overlay Effect */}
                    {activeTab === 'scanner' && isLoading && (
                        <div className="absolute inset-0 z-20 bg-indigo-500/20 animate-pulse pointer-events-none border-y-4 border-indigo-400/50">
                            <div className="w-full h-1 bg-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.8)] absolute top-0 animate-[scan_2s_ease-in-out_infinite]"></div>
                        </div>
                    )}
                </div>
            </div>

            {/* 3. Controls Overlay (Visualizer Only) */}
            {activeTab === 'visualizer' && !resultImage && (
                <div className="absolute bottom-4 right-4 flex flex-col items-center gap-3 z-40">
                    {interactionMode === 'draw' && (
                        <div className="bg-white/90 backdrop-blur-sm p-2 rounded-full shadow-xl border border-gray-200 flex flex-col items-center h-48 w-10 justify-center relative">
                            <input 
                                type="range" 
                                min="10" max="300" 
                                value={brushSize} 
                                onChange={(e) => setBrushSize(Number(e.target.value))}
                                className="absolute h-2 w-32 bg-gray-300 rounded-lg appearance-none cursor-pointer outline-none -rotate-90 origin-center"
                            />
                        </div>
                    )}
                    <div className="bg-white shadow-lg rounded-2xl flex flex-col overflow-hidden border border-gray-200">
                        <button onClick={() => handleZoom(0.2)} className="p-3 hover:bg-gray-100 text-gray-700 border-b border-gray-100"><ZoomIn size={20} /></button>
                        <button onClick={() => handleZoom(-0.2)} className="p-3 hover:bg-gray-100 text-gray-700"><ZoomOut size={20} /></button>
                    </div>
                    <button 
                        onClick={clearCanvas}
                        className="p-3 bg-white text-red-500 rounded-full shadow-lg border border-gray-200 hover:bg-red-50"
                    >
                        <RefreshCw size={20} />
                    </button>
                </div>
            )}
          </>
        )}
      </div>

      {/* 4. Bottom Panel (Fixed) */}
      {image && (
          <div className={`absolute bottom-[68px] left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-200 p-4 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] transition-all`}>
             
             {/* A. VISUALIZER CONTROLS */}
             {activeTab === 'visualizer' && (
                 <>
                    {!resultImage ? (
                        <div className="space-y-2">
                            <div className="flex gap-2">
                                <input
                                    className="flex-1 bg-gray-100 text-slate-800 p-3 rounded-xl border-0 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                    placeholder={hasDrawn ? "Deskripsikan perubahan pada area MERAH..." : "Deskripsikan perubahan..."}
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                />
                                <button 
                                    onClick={handleGenerate}
                                    disabled={!prompt || isLoading}
                                    className={`p-3 rounded-xl shadow-lg transition-all ${prompt ? 'bg-indigo-600 text-white' : 'bg-gray-300 text-gray-500'}`}
                                >
                                    {isLoading ? <RefreshCw className="animate-spin" /> : <ArrowRight />}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <button onClick={handleReset} className="px-4 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-gray-200">
                                <RefreshCw size={18} /> <span className="hidden sm:inline">Ulangi</span>
                            </button>
                            <button onClick={handleDownload} className="px-4 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-gray-200">
                                <Download size={18} /> <span className="hidden sm:inline">Simpan</span>
                            </button>
                            <button onClick={handleContinueEdit} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg hover:bg-indigo-700">
                                <PenTool size={18} /> Lanjut Edit
                            </button>
                        </div>
                    )}
                 </>
             )}

             {/* B. SCANNER CONTROLS */}
             {activeTab === 'scanner' && (
                 <div className="flex flex-col gap-3">
                     {!scanResult ? (
                         <button 
                             onClick={handleScan} 
                             disabled={isLoading}
                             className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg hover:bg-indigo-700 disabled:bg-gray-400"
                         >
                             {isLoading ? <Loader2 className="animate-spin" /> : <ScanLine />}
                             {isLoading ? 'Menganalisa Material...' : 'Analisa Material Sekarang'}
                         </button>
                     ) : (
                         <div className="animate-in slide-in-from-bottom duration-300">
                             <div className="flex justify-between items-start mb-3 border-b pb-2">
                                <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                    <Info size={18} className="text-indigo-600" /> Hasil Deteksi
                                </h4>
                                <button onClick={() => setScanResult(null)} className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded hover:bg-gray-200">Reset</button>
                             </div>
                             <div className="grid grid-cols-1 gap-2 text-sm max-h-[180px] overflow-y-auto">
                                <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                    <span className="text-xs text-slate-400 font-bold uppercase">Material</span>
                                    <p className="text-slate-800 font-medium">{scanResult.detectedMaterial}</p>
                                </div>
                                <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                    <span className="text-xs text-slate-400 font-bold uppercase">Kondisi</span>
                                    <p className="text-slate-800 font-medium">{scanResult.condition}</p>
                                </div>
                                <div className="bg-yellow-50 p-2 rounded border border-yellow-100">
                                    <span className="text-xs text-yellow-600 font-bold uppercase flex items-center gap-1"><TriangleAlert size={10}/> Saran</span>
                                    <p className="text-slate-700">{scanResult.suggestion}</p>
                                </div>
                                <div className="bg-green-50 p-2 rounded border border-green-100">
                                    <span className="text-xs text-green-600 font-bold uppercase">Item RAB</span>
                                    <p className="text-green-800 font-mono text-xs">{scanResult.ahspSuggestion}</p>
                                </div>
                             </div>
                         </div>
                     )}
                 </div>
             )}

          </div>
      )}
      
      <style>{`
        @keyframes scan {
            0% { top: 0%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default Visualizer;
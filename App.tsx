import React, { useState } from 'react';
import { Home, PenTool, Hammer, LayoutGrid } from 'lucide-react';
import Visualizer from './components/Visualizer';
import RABCalculator from './components/RABCalculator';
import Tools from './components/Tools';
import { AppView } from './types';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.HOME);

  const renderView = () => {
    switch (currentView) {
      case AppView.VISUALIZER:
        return <Visualizer />;
      case AppView.RAB:
        return <RABCalculator />;
      case AppView.TOOLS:
        return <Tools />;
      case AppView.HOME:
      default:
        return <HomeMenu setView={setCurrentView} />;
    }
  };

  return (
    <div className="h-screen w-full bg-gray-100 flex justify-center">
      {/* Mobile-first container */}
      <div className="w-full max-w-md bg-white h-full relative shadow-2xl overflow-hidden flex flex-col">
        
        {/* Main Content Area - Flex 1 takes remaining space, Nav stays fixed below */}
        <div className="flex-1 overflow-hidden relative flex flex-col">
           {renderView()}
        </div>

        {/* Bottom Navigation - Fixed relative to flex container */}
        <nav className="bg-white border-t border-gray-200 flex justify-around items-center p-2 pb-4 z-50 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <NavButton 
            active={currentView === AppView.HOME} 
            onClick={() => setCurrentView(AppView.HOME)} 
            icon={<Home size={24} />} 
            label="Beranda" 
          />
          <NavButton 
            active={currentView === AppView.VISUALIZER} 
            onClick={() => setCurrentView(AppView.VISUALIZER)} 
            icon={<PenTool size={24} />} 
            label="Visual" 
          />
          <NavButton 
            active={currentView === AppView.RAB} 
            onClick={() => setCurrentView(AppView.RAB)} 
            icon={<Hammer size={24} />} 
            label="Buat RAB" 
          />
          <NavButton 
            active={currentView === AppView.TOOLS} 
            onClick={() => setCurrentView(AppView.TOOLS)} 
            icon={<LayoutGrid size={24} />} 
            label="Fitur" 
          />
        </nav>
      </div>
    </div>
  );
};

// Helper components
const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick} 
    className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${active ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
  >
    {icon}
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);

const HomeMenu: React.FC<{ setView: (v: AppView) => void }> = ({ setView }) => (
  <div className="p-6 space-y-8 overflow-y-auto h-full bg-gradient-to-br from-indigo-50 to-white pb-6">
    <header>
      <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Pro<span className="text-indigo-600">Konstruksi</span></h1>
      <p className="text-gray-500 mt-1">Asisten Cerdas Kontraktor Modern</p>
    </header>

    <div className="grid grid-cols-1 gap-4">
      <DashboardCard 
        title="AI Visualizer" 
        desc="Ubah dinding bata jadi marmer dalam hitungan detik."
        icon={<PenTool className="text-white" size={24} />}
        color="bg-indigo-500"
        onClick={() => setView(AppView.VISUALIZER)}
      />
      <DashboardCard 
        title="Buat RAB" 
        desc="Susun penawaran, sesuaikan harga bahan & analisa."
        icon={<Hammer className="text-white" size={24} />}
        color="bg-emerald-500"
        onClick={() => setView(AppView.RAB)}
      />
      <DashboardCard 
        title="Scanner Material" 
        desc="Deteksi kerusakan & cari toko bangunan terdekat."
        icon={<LayoutGrid className="text-white" size={24} />}
        color="bg-orange-500"
        onClick={() => setView(AppView.TOOLS)}
      />
    </div>
  </div>
);

const DashboardCard: React.FC<{ title: string; desc: string; icon: React.ReactNode; color: string; onClick: () => void }> = ({ title, desc, icon, color, onClick }) => (
  <button onClick={onClick} className="bg-white p-5 rounded-2xl shadow-md border border-gray-100 flex items-center gap-4 hover:shadow-lg transition-all text-left group">
    <div className={`${color} p-4 rounded-xl shadow-sm group-hover:scale-110 transition-transform`}>
      {icon}
    </div>
    <div>
      <h3 className="font-bold text-lg text-gray-800">{title}</h3>
      <p className="text-sm text-gray-500 leading-snug">{desc}</p>
    </div>
  </button>
);

export default App;
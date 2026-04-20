/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export default function App() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden text-gravy">
      {/* Marquee Background */}
      <div className="whitespace-nowrap text-[10rem] opacity-5 absolute z-0 pointer-events-none font-serif font-bold">
        GRAVY GRAVY GRAVY GRAVY
      </div>

      {/* Nav */}
      <nav className="relative z-10 px-10 py-8 flex justify-between items-center">
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-4xl font-black tracking-tighter">Gravy</span>
          <div className="bg-gravy text-curd rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest">
            Powered by PoutineOS
          </div>
        </div>
        <div className="flex gap-8 text-sm font-bold uppercase tracking-widest">
          <a href="#" className="hover:opacity-60 transition-opacity">Feed</a>
          <a href="#" className="opacity-40 hover:opacity-100 transition-opacity">Discover</a>
          <a href="#" className="opacity-40 hover:opacity-100 transition-opacity">Map</a>
          <a href="#" className="opacity-40 hover:opacity-100 transition-opacity">Login</a>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex-1 grid grid-cols-12 gap-6 px-10 pb-10">
        {/* Left Column (Main Card) */}
        <div className="col-span-7 flex flex-col justify-end">
          <div className="relative bg-white p-10 shadow-[20px_20px_0px_rgba(61,43,31,0.05)] border border-gray-100 mb-4">
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-fry rounded-full flex items-center justify-center border-4 border-white transform rotate-12 shadow-lg">
              <div className="text-center leading-tight text-gravy">
                <span className="block font-black text-2xl">4.9</span>
                <span className="text-[10px] uppercase font-bold">Squeak</span>
              </div>
            </div>
            
            <h2 className="font-serif text-6xl font-bold leading-tight mb-4">La Banquise</h2>
            <p className="text-lg text-gray-600 max-w-md mb-8">
              "The ultimate late-night pilgrimage. PoutineOS notes: Heavy on the curds, legendary dark gravy, and a vibe that defines Plateau Mont-Royal."
            </p>
            
            <div className="flex gap-4">
              <button className="bg-gravy text-white px-8 py-4 font-bold uppercase text-xs tracking-widest hover:opacity-90 transition-opacity">
                View Gallery
              </button>
              <button className="border-2 border-gravy text-gravy px-8 py-4 font-bold uppercase text-xs tracking-widest hover:bg-gray-50 transition-colors">
                Write Review
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-tighter opacity-60">
            <span className="w-12 h-px bg-current"></span>
            <span>994 Parc Ave, Montreal, QC</span>
          </div>
        </div>

        {/* Right Column (Sidecards) */}
        <div className="col-span-5 flex flex-col gap-6">
          <div className="flex-1 bg-white/60 backdrop-blur-md border border-white/40 p-8 flex flex-col">
            <div className="flex justify-between items-end mb-8">
              <h3 className="font-serif text-2xl italic">Latest Reviews</h3>
              <span className="text-xs font-bold uppercase tracking-widest opacity-40">Live Feed</span>
            </div>
            
            <div className="space-y-8 overflow-hidden">
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 bg-gray-200 rounded-full shrink-0"></div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-sm">@curd_nerd</span>
                    <span className="text-[10px] opacity-40">2m ago</span>
                  </div>
                  <p className="text-sm leading-relaxed text-gray-700">The triple-cooked fries at Chez Claudette are a revelation. Squeak level: 10/10.</p>
                </div>
              </div>
              
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 bg-gray-200 rounded-full shrink-0"></div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-sm">poutine_papi</span>
                    <span className="text-[10px] opacity-40">14m ago</span>
                  </div>
                  <p className="text-sm leading-relaxed text-gray-700">A bit skimpy on the gravy today, but the portion size is still unmatched in the Mile End.</p>
                </div>
              </div>
              
              <div className="flex gap-4 items-start opacity-40">
                <div className="w-10 h-10 bg-gray-200 rounded-full shrink-0"></div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-sm">gravy_train</span>
                    <span className="text-[10px] opacity-40">1h ago</span>
                  </div>
                  <p className="text-sm leading-relaxed">Montreal pool hall style poutine is the only true form...</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-white border-2 border-gravy p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">PoutineOS is drafting a description for <strong>"Le Roy Jucep"</strong></span>
            </div>
            <button className="text-xs font-black uppercase underline decoration-2 underline-offset-4 hover:opacity-70">
              View Draft
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-10 py-6 border-t border-gravy/10 flex justify-between items-center bg-white z-10">
        <div className="flex gap-6 items-center">
          <div className="flex -space-x-2">
            <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-300"></div>
            <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-400"></div>
            <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-500"></div>
          </div>
          <span className="text-xs font-bold">1.2k users searching nearby</span>
        </div>
        <div className="text-[10px] uppercase font-bold tracking-widest opacity-40">
          Gravy © {new Date().getFullYear()} • Montreal, QC
        </div>
      </footer>
    </div>
  );
}

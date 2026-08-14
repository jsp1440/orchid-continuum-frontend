import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, HeartHandshake, Mail } from 'lucide-react';

const HumanStewardship: React.FC = () => (
  <section id="human-stewardship" className="border-b border-[#26372a] bg-[#1d2d22] text-[#f4efe3]">
    <div className="mx-auto grid max-w-[1280px] gap-8 px-6 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-10 lg:py-16">
      <div className="max-w-2xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#d3b75d]">Conservation and participation</p>
        <h2 className="mt-3 font-serif text-4xl leading-tight md:text-5xl">Knowledge matters most when it helps people care for living orchids.</h2>
        <p className="mt-4 max-w-xl text-[17px] leading-7 text-[#ded7c8]">
          Explore conservation work, contribute observations, learn from the evidence, or support the infrastructure that keeps the Continuum open and useful.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <Link to="/conservation" className="group flex items-center justify-between gap-4 rounded-2xl border border-[#d3b75d]/35 bg-white/[0.04] px-5 py-4 hover:bg-white/[0.07]">
          <span className="flex items-center gap-3"><HeartHandshake className="h-5 w-5 text-[#d3b75d]" /><span>Explore conservation</span></span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
        <Link to="/about" className="group flex items-center justify-between gap-4 rounded-2xl border border-white/15 bg-white/[0.03] px-5 py-4 hover:bg-white/[0.06]">
          <span className="flex items-center gap-3"><Mail className="h-5 w-5 text-[#d3b75d]" /><span>Stay connected</span></span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </div>
  </section>
);

export default HumanStewardship;

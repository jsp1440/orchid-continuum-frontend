import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { LexiconEntry } from '@/data/types';
import { getEntries, getEntry } from '@/lib/lexiconService';
import { DemoBanner, SiteFooter, SiteHeader, type ViewKey } from '@/components/lexicon/SiteChrome';
import { HomeView } from '@/components/lexicon/HomeView';
import { LexiconBrowser } from '@/components/lexicon/LexiconBrowser';
import { CollectionView } from '@/components/lexicon/CollectionView';
import { EntryView } from '@/components/lexicon/EntryView';
import { PartnersView } from '@/components/lexicon/PartnersView';
import { AboutView } from '@/components/lexicon/AboutView';
import { ValidationView } from '@/components/lexicon/ValidationView';
import { DisplayPreferencesProvider } from '@/contexts/DisplayPreferences';

interface RouteState { view: ViewKey; slug?: string; query?: string; }

function parseRoute(pathname:string,search:string):RouteState {
  const path=pathname.replace(/^\/lexicon\/?/,'');
  const parts=path.split('/').filter(Boolean);
  const query=new URLSearchParams(search).get('q')??undefined;
  if(parts[0]==='entry'&&parts[1])return{view:'entry',slug:decodeURIComponent(parts[1])};
  if(parts[0]==='browse'||parts[0]==='a-z')return{view:'lexicon',query};
  if(parts[0]==='collection')return{view:'collection'};
  if(parts[0]==='partners')return{view:'partners'};
  if(parts[0]==='about')return{view:'about'};
  if(parts[0]==='validation')return{view:'validation'};
  return{view:'home'};
}

function pathFor(view:ViewKey,slug?:string,query?:string):string {
  switch(view){
    case'entry':return`/lexicon/entry/${encodeURIComponent(slug??'resupination')}`;
    case'lexicon':return query?`/lexicon/browse?q=${encodeURIComponent(query)}`:'/lexicon/browse';
    case'collection':return'/lexicon/collection';
    case'partners':return'/lexicon/partners';
    case'about':return'/lexicon/about';
    case'validation':return'/lexicon/validation';
    case'admin':return'/lexicon/about#editorial-migration';
    default:return'/lexicon';
  }
}

const LexiconAppLayout:React.FC=()=>{
  const[entries,setEntries]=useState<LexiconEntry[]>([]);
  const[activeEntry,setActiveEntry]=useState<LexiconEntry|undefined>();
  const[loading,setLoading]=useState(true);
  const[loadError,setLoadError]=useState('');
  const location=useLocation();
  const navigateRouter=useNavigate();
  const route=useMemo(()=>parseRoute(location.pathname,location.search),[location.pathname,location.search]);

  const load=useCallback(async()=>{
    setLoading(true);
    setLoadError('');
    try{
      if(route.view==='entry'&&route.slug){
        setActiveEntry(await getEntry(route.slug));
        return;
      }
      setActiveEntry(undefined);
      setEntries(await getEntries());
    }catch(error){
      setLoadError(error instanceof Error?error.message:'Lexicon load failed');
    }finally{
      setLoading(false);
    }
  },[route.view,route.slug]);

  useEffect(()=>{void load();},[load]);
  const go=useCallback((view:ViewKey,slug?:string,query?:string)=>{navigateRouter(pathFor(view,slug,query));window.scrollTo({top:0,behavior:'smooth'});},[navigateRouter]);
  const openEntry=useCallback((slug:string)=>go('entry',slug),[go]);
  const browseWithQuery=useCallback((q:string)=>go('lexicon',undefined,q),[go]);

  return <DisplayPreferencesProvider><div className="min-h-screen bg-[#FDFBF6] text-stone-900 antialiased"><a href="#lexicon-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-[#6B3FA0] focus:px-4 focus:py-2 focus:text-sm focus:text-white">Skip to lexicon content</a><DemoBanner/><SiteHeader view={route.view} onNavigate={(view,slug)=>go(view,slug)}/><main id="lexicon-main">{loadError&&<div role="alert" className="mx-auto mt-6 max-w-5xl rounded-sm border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">Canonical lexicon load warning: {loadError}. The migration fallback remains available.</div>}{loading?<div className="mx-auto max-w-3xl px-4 py-32 text-center"><p className="font-serif text-xl text-stone-500" style={{fontFamily:'Georgia, serif'}}>Loading the lexicon…</p></div>:route.view==='home'?<HomeView entries={entries} onOpen={openEntry} onNavigate={(view,slug)=>go(view,slug)} onSearch={browseWithQuery}/>:route.view==='lexicon'?<LexiconBrowser entries={entries} onOpen={openEntry} initialQuery={route.query??''}/>:route.view==='collection'?<CollectionView entries={entries} onOpen={openEntry} onBrowse={()=>go('lexicon')}/>:route.view==='partners'?<PartnersView/>:route.view==='about'||route.view==='admin'?<AboutView/>:route.view==='validation'?<ValidationView onOpenEntry={openEntry}/>:activeEntry?<EntryView entry={activeEntry} onOpen={openEntry} onBrowse={()=>go('lexicon')}/>:<div className="mx-auto max-w-3xl px-4 py-24 text-center"><h1 className="font-serif text-3xl text-stone-900" style={{fontFamily:'Georgia, serif'}}>Term not found in the lexicon</h1><p className="mt-3 text-stone-600">That concept has not been indexed in the canonical or migration records yet.</p><button type="button" onClick={()=>go('lexicon')} className="mt-6 rounded-sm bg-[#6B3FA0] px-5 py-2.5 text-sm font-medium text-white">Browse the A–Z lexicon</button></div>}</main><SiteFooter onNavigate={(view,slug)=>go(view,slug)}/></div></DisplayPreferencesProvider>;
};

export default LexiconAppLayout;

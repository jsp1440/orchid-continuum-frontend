import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Globe2,
  Leaf,
  Pause,
  Play,
  Rocket,
  Sparkles,
  Sprout,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * StoriesFromContinuum — rotating story-gallery exhibit for the homepage.
 *
 * This section turns FCOS articles, historical orchid stories, pollination
 * biology, mycorrhizal ecology, conservation notes, and speculative science
 * writing into a living museum-style story stream. It is intentionally seeded
 * with hand-curated stories first, then can later be hydrated from the OC Story
 * Archive / OREP / Oasis.
 */

type StoryTone =
  | 'history'
  | 'science'
  | 'future'
  | 'culture'
  | 'conservation'
  | 'speculative';

interface ContinuumStory {
  id: string;
  title: string;
  kicker: string;
  teaser: string;
  body: string;
  readingTime: string;
  tone: StoryTone;
  tags: string[];
  related: string[];
  note?: string;
}

const ROTATION_INTERVAL_MS = 45000;
const VISIBLE_STORIES = 4;

const STORIES: ContinuumStory[] = [
  {
    id: 'edmond-albius-vanilla',
    title: 'The Boy Who Saved Vanilla',
    kicker: 'History · Human ingenuity',
    teaser:
      'A young boy on Réunion Island discovered the hand-pollination method that transformed vanilla from a botanical curiosity into a global crop.',
    body:
      'Vanilla is an orchid, but outside its native pollinator range it could not easily produce pods. The story of Edmond Albius reminds us that orchid history is also human history: observation, skill, colonial power, agriculture, and one extraordinary act of insight converged in a flower. In the Continuum, this story belongs not only under Vanilla, but also under agriculture, culture, equity, and the people who changed orchid history.',
    readingTime: '45 sec',
    tone: 'history',
    tags: ['Vanilla', 'History', 'Agriculture'],
    related: ['Vanilla planifolia', 'Réunion Island', 'Human innovation'],
  },
  {
    id: 'orchids-on-mars',
    title: 'Could Orchids Help Terraform Mars?',
    kicker: 'Future orchids · Speculative biology',
    teaser:
      'A playful thought experiment asks what orchid-fungal partnerships might teach future biologists about building ecosystems beyond Earth.',
    body:
      'This story is speculative, but it is not empty fantasy. Orchid seeds, fungal symbioses, CAM photosynthesis, stress tolerance, biotechnology, and closed ecological systems all raise real scientific questions. The point is not that orchids are about to bloom on Mars. The point is that orchids are such strange and demanding organisms that they make us think harder about what life needs in order to persist anywhere.',
    readingTime: '60 sec',
    tone: 'speculative',
    tags: ['Biotechnology', 'Mars', 'What if?'],
    related: ['Orchid mycorrhizae', 'Synthetic biology', 'Future conservation'],
    note: 'Imaginative exploration inspired by orchid science.',
  },
  {
    id: 'darwin-comet-orchid',
    title: 'Darwin Predicts a Moth',
    kicker: 'Evolution · Prediction',
    teaser:
      'A flower with a long nectar spur suggested the existence of an animal no one had yet seen.',
    body:
      'The famous comet orchid story remains powerful because it shows how a flower can become a scientific prediction. A very long nectary implied a pollinator with a matching tongue. The Orchid Continuum uses stories like this as gateways: from beauty to mechanism, from a flower to an ecological relationship, and from a relationship to evidence that can be mapped, tested, and taught.',
    readingTime: '45 sec',
    tone: 'science',
    tags: ['Darwin', 'Pollination', 'Evolution'],
    related: ['Angraecum sesquipedale', 'Hawkmoths', 'Co-evolution'],
  },
  {
    id: 'bucket-orchid-prison',
    title: 'The Bucket Orchid Trap',
    kicker: 'Pollination · Behavioral ecology',
    teaser:
      'Some orchids do not simply attract pollinators. They route them through an architectural trap.',
    body:
      'Bucket orchids and euglossine bees turn pollination into a living mechanism. Male bees collect fragrance compounds, slip into a fluid-filled structure, and escape through a narrow route that positions pollen exactly where the orchid needs it. It is not just a flower. It is a behavioral machine built from petals, scent, water, and insect desire.',
    readingTime: '45 sec',
    tone: 'science',
    tags: ['Pollination', 'Euglossine bees', 'Behavior'],
    related: ['Coryanthes', 'Euglossine bees', 'Fragrance collection'],
  },
  {
    id: 'first-thanksgiving-orchid',
    title: 'Orchids at the First Thanksgiving?',
    kicker: 'Speculative history · Native orchids',
    teaser:
      'A speculative Thanksgiving story can still lead readers toward real questions about New England orchids, wetlands, and habitat recovery.',
    body:
      'A story can begin as imagination and still open a door to science. Asking whether orchids grew near early Plymouth landscapes leads directly to native terrestrial orchids, bogs, cranberry wetlands, land conversion, and restoration. The power of the story is not that every detail is proven. The power is that it makes people curious enough to ask what orchids lived there, what happened to them, and whether they can return.',
    readingTime: '60 sec',
    tone: 'culture',
    tags: ['Thanksgiving', 'Native orchids', 'Habitat'],
    related: ['New England orchids', 'Wetland restoration', 'Cultural storytelling'],
    note: 'Speculative storytelling clearly marked as an imaginative entry point.',
  },
  {
    id: 'fungal-beginning',
    title: 'Every Orchid Begins Underground',
    kicker: 'Mycorrhizae · Hidden life',
    teaser:
      'Before an orchid can become a flower, it must first survive as a tiny seed dependent on fungal help.',
    body:
      'Orchid seeds are famously small and contain little stored food. Many cannot germinate successfully without a fungal partner that supplies resources to the developing protocorm. That means the beginning of an orchid is not a solitary seedling pushing into the light. It is a hidden relationship beneath the surface — an invisible collaboration that makes the visible flower possible.',
    readingTime: '45 sec',
    tone: 'science',
    tags: ['Fungi', 'Germination', 'Symbiosis'],
    related: ['Orchid mycorrhizae', 'Seeds', 'Protocorms'],
  },
];

const TONE_META: Record<StoryTone, { label: string; color: string; bg: string; Icon: React.ComponentType<{ className?: string }> }> = {
  history: { label: 'History', color: '#f0c46b', bg: 'rgba(240,196,107,0.12)', Icon: BookOpen },
  science: { label: 'Science', color: '#9fd6ff', bg: 'rgba(93,175,220,0.12)', Icon: FlaskConical },
  future: { label: 'Future', color: '#94f0d3', bg: 'rgba(94,220,184,0.12)', Icon: Rocket },
  culture: { label: 'Culture', color: '#f4a6d7', bg: 'rgba(244,166,215,0.12)', Icon: Globe2 },
  conservation: { label: 'Conservation', color: '#9ee6a8', bg: 'rgba(120,220,140,0.12)', Icon: Leaf },
  speculative: { label: 'What if?', color: '#d8b4fe', bg: 'rgba(168,120,220,0.14)', Icon: Sparkles },
};

const StoriesFromContinuum: React.FC = () => {
  const [offset, setOffset] = useState(0);
  const [paused, setPaused] = useState(false);
  const [activeStory, setActiveStory] = useState<ContinuumStory | null>(null);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setOffset((current) => (current + 1) % STORIES.length);
    }, ROTATION_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  const hero = STORIES[offset % STORIES.length];
  const visible = useMemo(() => {
    return Array.from({ length: VISIBLE_STORIES }, (_, i) => STORIES[(offset + i) % STORIES.length]);
  }, [offset]);

  const step = (direction: 1 | -1) => {
    setOffset((current) => (current + direction + STORIES.length) % STORIES.length);
  };

  return (
    <section
      id="stories-from-the-continuum"
      className="relative overflow-hidden border-b border-white/[0.06] bg-[#120f1a] text-[#f5f0e8] scroll-mt-20"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 20% 0%, rgba(212,179,74,0.18) 0%, transparent 56%),' +
            'radial-gradient(ellipse at 85% 85%, rgba(140,80,180,0.22) 0%, transparent 58%)',
        }}
      />
      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-20 lg:py-24">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-3 font-mono text-[12px] tracking-[0.32em] uppercase text-[#d4b34a]">
              <span className="inline-block w-8 h-px bg-[#d4b34a]/60" />
              Stories From the Continuum
            </div>
            <h2
              className="mt-5 text-[#faf7f2] leading-[1.07]"
              style={{
                fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
                fontSize: 'clamp(2rem, 4vw, 3.3rem)',
                fontWeight: 700,
              }}
            >
              Orchid science, history, and imagination —{' '}
              <span className="italic text-[#d4b34a]">always changing</span>.
            </h2>
            <p className="mt-5 text-[#eee3d3] font-body max-w-2xl" style={{ fontSize: 18, lineHeight: 1.7 }}>
              Short, rotating story cards turn the knowledge graph into a living
              exhibit. Some are historical, some are scientific, and some are
              clearly marked imaginative explorations inspired by orchid biology.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous story"
              className="h-10 w-10 rounded-full border border-white/15 text-[#f5f0e8] hover:border-[#d4b34a]/70 hover:text-[#d4b34a] transition-colors flex items-center justify-center"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Resume story rotation' : 'Pause story rotation'}
              className="h-10 w-10 rounded-full border border-white/15 text-[#f5f0e8] hover:border-[#d4b34a]/70 hover:text-[#d4b34a] transition-colors flex items-center justify-center"
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next story"
              className="h-10 w-10 rounded-full border border-white/15 text-[#f5f0e8] hover:border-[#d4b34a]/70 hover:text-[#d4b34a] transition-colors flex items-center justify-center"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-6 items-stretch">
          <article className="lg:col-span-2 rounded-3xl border border-[#d4b34a]/20 bg-[#21172b]/85 p-7 lg:p-8 shadow-2xl shadow-black/20">
            <StoryIcon story={hero} size="lg" />
            <div className="mt-6 font-mono text-[11px] tracking-[0.22em] uppercase text-[#d4b34a]">
              Featured story · {hero.readingTime}
            </div>
            <h3
              className="mt-4 text-[#faf7f2] leading-tight"
              style={{ fontFamily: '"Playfair Display",Georgia,serif', fontSize: 'clamp(1.8rem, 3vw, 2.5rem)' }}
            >
              {hero.title}
            </h3>
            <p className="mt-4 text-[#efe6d8] font-body" style={{ fontSize: 18, lineHeight: 1.7 }}>
              {hero.teaser}
            </p>
            {hero.note && (
              <p className="mt-4 rounded-2xl border border-[#d8b4fe]/25 bg-[#d8b4fe]/10 px-4 py-3 text-[#ead6ff] font-body" style={{ fontSize: 15, lineHeight: 1.6 }}>
                {hero.note}
              </p>
            )}
            <button
              type="button"
              onClick={() => setActiveStory(hero)}
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-6 py-3 font-mono text-[11px] tracking-[0.22em] uppercase font-semibold text-[#120f1a] hover:bg-[#e2c761] transition-colors"
            >
              Read story
              <ArrowRight className="h-4 w-4" />
            </button>
          </article>

          <div className="lg:col-span-3 grid sm:grid-cols-2 gap-4">
            {visible.map((story) => (
              <button
                type="button"
                key={story.id}
                onClick={() => setActiveStory(story)}
                className="group text-left rounded-3xl border border-white/[0.08] bg-[#191426]/75 p-5 lg:p-6 hover:border-[#d4b34a]/45 hover:bg-[#21172b] transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <StoryIcon story={story} />
                  <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#8f8498]">
                    {story.readingTime}
                  </span>
                </div>
                <div className="mt-5 font-mono text-[10px] tracking-[0.22em] uppercase text-[#d4b34a]">
                  {story.kicker}
                </div>
                <h4
                  className="mt-3 text-[#faf7f2] group-hover:text-[#d4b34a] transition-colors"
                  style={{ fontFamily: '"Playfair Display",Georgia,serif', fontSize: 23, lineHeight: 1.15 }}
                >
                  {story.title}
                </h4>
                <p className="mt-3 text-[#ddd2c3] font-body" style={{ fontSize: 16, lineHeight: 1.65 }}>
                  {story.teaser}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {story.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[9px] tracking-[0.16em] uppercase text-[#cfc3b2]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={!!activeStory} onOpenChange={(open) => !open && setActiveStory(null)}>
        <DialogContent className="max-w-3xl border-[#d4b34a]/25 bg-[#120f1a] text-[#f5f0e8] p-0 overflow-hidden">
          {activeStory && (
            <div>
              <div className="p-7 lg:p-8 border-b border-white/[0.08] bg-[#21172b]">
                <DialogHeader>
                  <div className="mb-4"><StoryIcon story={activeStory} /></div>
                  <DialogDescription className="font-mono text-[11px] tracking-[0.24em] uppercase text-[#d4b34a]">
                    {activeStory.kicker} · {activeStory.readingTime}
                  </DialogDescription>
                  <DialogTitle
                    className="text-[#faf7f2] leading-tight"
                    style={{ fontFamily: '"Playfair Display",Georgia,serif', fontSize: 'clamp(2rem, 4vw, 3rem)' }}
                  >
                    {activeStory.title}
                  </DialogTitle>
                </DialogHeader>
              </div>
              <div className="p-7 lg:p-8">
                <p className="text-[#efe6d8] font-body" style={{ fontSize: 19, lineHeight: 1.75 }}>
                  {activeStory.body}
                </p>
                <div className="mt-7 grid sm:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5">
                    <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[#d4b34a]">
                      Related nodes
                    </div>
                    <ul className="mt-3 space-y-2 text-[#efe6d8] font-body" style={{ fontSize: 16 }}>
                      {activeStory.related.map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5">
                    <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[#d4b34a]">
                      Story archive status
                    </div>
                    <p className="mt-3 text-[#efe6d8] font-body" style={{ fontSize: 16, lineHeight: 1.65 }}>
                      Hand-curated seed story. Later this can be hydrated from the OC Story Archive,
                      literature extraction pipeline, and Oasis-generated candidate stories.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
};

const StoryIcon: React.FC<{ story: ContinuumStory; size?: 'sm' | 'lg' }> = ({ story, size = 'sm' }) => {
  const meta = TONE_META[story.tone];
  const Icon = meta.Icon;
  const className = size === 'lg' ? 'h-8 w-8' : 'h-5 w-5';
  return (
    <span
      className={size === 'lg' ? 'inline-flex h-16 w-16 items-center justify-center rounded-2xl border' : 'inline-flex h-11 w-11 items-center justify-center rounded-full border'}
      style={{ color: meta.color, background: meta.bg, borderColor: `${meta.color}55` }}
      title={meta.label}
    >
      <Icon className={className} />
    </span>
  );
};

export default StoriesFromContinuum;

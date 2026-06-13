interface WheelProps {
  speciesId: string;
}

export default function KnowledgeWheel({
  speciesId,
}: WheelProps) {
  const spokes = [
    'Pollinators',
    'Mycorrhizae',
    'Habitat',
    'Climate',
    'Conservation',
    'Literature',
    'History',
    'Genetics',
  ];

  return (
    <div className="relative w-[500px] h-[500px] mx-auto">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-full border p-8">
          Species
        </div>
      </div>

      {spokes.map((spoke, i) => (
        <div
          key={spoke}
          className="absolute"
          style={{
            left: `${50 + 35 * Math.cos((i * Math.PI * 2) / spokes.length)}%`,
            top: `${50 + 35 * Math.sin((i * Math.PI * 2) / spokes.length)}%`,
          }}
        >
          {spoke}
        </div>
      ))}
    </div>
  );
}

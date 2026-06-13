import { KnowledgeObject } from '@/types/knowledgeObject';

interface Props {
  object: KnowledgeObject;
}

export default function KnowledgeObjectCard({ object }: Props) {
  return (
    <div className="rounded-2xl border border-amber-700/20 bg-[#f5f0e5] p-6">
      <h2 className="text-4xl italic">
        {object.scientificName}
      </h2>

      {object.image && (
        <img
          src={object.image}
          alt={object.scientificName}
          className="mt-4 rounded-xl"
        />
      )}

      <p className="mt-4 text-lg">
        {object.summary}
      </p>

      <div className="grid grid-cols-2 gap-3 mt-6">
        {object.metrics.map(metric => (
          <div
            key={metric.label}
            className="border rounded-xl p-3"
          >
            <div className="text-xs uppercase">
              {metric.label}
            </div>

            <div className="text-xl font-semibold">
              {metric.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

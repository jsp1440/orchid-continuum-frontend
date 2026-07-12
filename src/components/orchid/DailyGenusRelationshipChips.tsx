import React, { useMemo } from 'react';
import RelationshipChips from '@/components/orchid/RelationshipChips';
import {
  buildExplorationContextFromSpeciesCard,
  makeExplorationNode,
  type ExplorationNode,
} from '@/lib/explorationContext';

interface DailyGenusRelationshipChipsProps {
  species?: string;
  genus?: string;
  habitat?: string;
  geography?: string;
  pollinator?: string;
  fungus?: string;
  conservation?: string;
  elevation?: string;
  sourceView?: string;
  className?: string;
}

function pushNode(nodes: ExplorationNode[], node: ExplorationNode | null): void {
  if (!node) return;
  if (nodes.some((n) => n.id === node.id)) return;
  nodes.push(node);
}

const DailyGenusRelationshipChips: React.FC<DailyGenusRelationshipChipsProps> = ({
  species,
  genus,
  habitat,
  geography,
  pollinator,
  fungus,
  conservation,
  elevation,
  sourceView,
  className = 'mt-5',
}) => {
  const context = useMemo(
    () =>
      buildExplorationContextFromSpeciesCard({
        species,
        genus,
        habitat,
        geography,
        pollinator,
        fungus,
        conservation,
        elevation,
        sourceView,
      }),
    [species, genus, habitat, geography, pollinator, fungus, conservation, elevation, sourceView],
  );

  const nodes = useMemo(() => {
    const out = [...context.nodes];

    if (species) {
      pushNode(
        out,
        makeExplorationNode({
          type: 'atlas',
          label: 'Atlas',
          value: species,
          sourceView,
        }),
      );
      pushNode(
        out,
        makeExplorationNode({
          type: 'knowledge',
          label: 'Knowledge Graph',
          value: species,
          sourceView,
        }),
      );
    }

    return out;
  }, [context.nodes, species, sourceView]);

  return (
    <RelationshipChips
      nodes={nodes}
      context={context}
      className={className}
      label="Explore connected knowledge"
    />
  );
};

export default DailyGenusRelationshipChips;

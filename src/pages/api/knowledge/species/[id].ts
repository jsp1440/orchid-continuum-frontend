import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  const payload = {
    speciesId: id,
    occurrences: 48221,
    images: 3742,
    literature: 186,
    pollinators: 12,
    mycorrhizae: 4,
    conservation: 'LC',
  };

  res.status(200).json(payload);
}

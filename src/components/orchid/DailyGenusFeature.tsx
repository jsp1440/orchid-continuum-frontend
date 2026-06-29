// Funding demo hotfix: use the last stable Genus-of-the-Day implementation.
// V3 keeps the robust image path: trusted backend cache -> harvester -> iNaturalist fallback.
// V5/V4 added newer wrappers, but currently route through a thinner image fetcher that can leave the homepage blank.
export { default } from './DailyGenusFeatureV3';

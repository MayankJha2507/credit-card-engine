import type { Metadata } from 'next';
import { Questionnaire } from '@/components/questionnaire/questionnaire';
import { getDataFreshness } from '@/lib/data/repository';

export const metadata: Metadata = {
  title: 'Find your card',
  description: 'Answer two short steps about your monthly spending and what you care about, and see which cards fit best.',
};

export default async function RecommendPage() {
  const { researchedCount } = await getDataFreshness();
  return <Questionnaire researchedCount={researchedCount} />;
}

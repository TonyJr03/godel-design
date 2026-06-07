import { EmptyState } from "./EmptyState";

type PlaceholderCardProps = {
  title: string;
  description: string;
};

export function PlaceholderCard({ title, description }: PlaceholderCardProps) {
  return (
    <EmptyState
      title={title}
      description={description}
      eyebrow="Pendiente"
    />
  );
}

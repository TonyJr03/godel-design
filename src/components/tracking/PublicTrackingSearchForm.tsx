import { Button, Input } from "@/components/ui";

type PublicTrackingSearchFormProps = {
  defaultReference?: string;
  hasError?: boolean;
};

export function PublicTrackingSearchForm({
  defaultReference = "",
  hasError = false,
}: PublicTrackingSearchFormProps) {
  return (
    <form action="/estado" method="get" className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="tracking-reference"
          className="block text-sm font-semibold text-text-primary"
        >
          Código de seguimiento
        </label>
        <Input
          id="tracking-reference"
          name="ref"
          type="text"
          defaultValue={defaultReference}
          placeholder="GD-8F3A-92BC"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          invalid={hasError}
          aria-describedby="tracking-reference-help"
          className="font-mono uppercase tracking-wide"
        />
        <p id="tracking-reference-help" className="text-sm leading-6 text-text-secondary">
          Introduce el código que recibiste al enviar tu solicitud o al crear tu
          pedido.
        </p>
      </div>

      <Button type="submit" size="lg" className="w-full sm:w-auto">
        Consultar estado
      </Button>
    </form>
  );
}

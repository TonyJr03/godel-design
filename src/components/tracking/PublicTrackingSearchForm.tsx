import { Button, Input } from "@/components/ui";

type PublicTrackingSearchFormProps = {
  defaultReference?: string;
  hasError?: boolean;
  layout?: "stacked" | "inline";
  helperText?: string;
};

export function PublicTrackingSearchForm({
  defaultReference = "",
  hasError = false,
  layout = "stacked",
  helperText = "Introduce el código que recibiste al enviar tu solicitud o al crear tu pedido.",
}: PublicTrackingSearchFormProps) {
  const isInline = layout === "inline";

  return (
    <form
      action="/estado"
      method="get"
      className={
        isInline
          ? "grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
          : "space-y-4"
      }
    >
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
          {helperText}
        </p>
      </div>

      <Button
        type="submit"
        size="lg"
        className={
          isInline ? "w-full self-start sm:mt-7 sm:w-auto" : "w-full sm:w-auto"
        }
      >
        Consultar estado
      </Button>
    </form>
  );
}

export type BaseActionState<FieldErrors = never, Values = never> = {
  ok: boolean;
  message: string;
} & ([FieldErrors] extends [never]
  ? Record<never, never>
  : { fieldErrors?: FieldErrors }) &
  ([Values] extends [never] ? Record<never, never> : { values?: Values });

export function actionFailure<FieldErrors = never, Values = never>(
  message: string,
  extra?: {
    fieldErrors?: FieldErrors;
    values?: Values;
  },
): BaseActionState<FieldErrors, Values> {
  return {
    ok: false,
    message,
    ...(extra ?? {}),
  } as BaseActionState<FieldErrors, Values>;
}

export function actionSuccess<Extra extends object = Record<never, never>>(
  message: string,
  extra?: Extra,
): { ok: true; message: string } & Extra {
  return {
    ok: true,
    message,
    ...(extra ?? {}),
  } as { ok: true; message: string } & Extra;
}

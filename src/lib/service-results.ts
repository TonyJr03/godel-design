export type ServiceSuccess<Data extends object = Record<never, never>> = {
  ok: true;
} & Data;

export type ServiceFailure<
  Reason extends string,
  Extra extends object = Record<never, never>,
  FieldErrors = never,
> = {
  ok: false;
  reason: Reason;
  message: string;
} & Extra &
  ([FieldErrors] extends [never]
    ? Record<never, never>
    : { fieldErrors?: FieldErrors });

export type ServiceResult<
  Data extends object = Record<never, never>,
  Reason extends string = string,
  Extra extends object = Record<never, never>,
  FieldErrors = never,
> = ServiceSuccess<Data> | ServiceFailure<Reason, Extra, FieldErrors>;

export function serviceSuccess<Data extends object = Record<never, never>>(
  data?: Data,
): ServiceSuccess<Data> {
  return {
    ok: true,
    ...(data ?? {}),
  } as ServiceSuccess<Data>;
}

export function serviceFailure<
  Reason extends string,
  Extra extends object = Record<never, never>,
>(
  reason: Reason,
  message: string,
  extra?: Extra,
): { ok: false; reason: Reason; message: string } & Extra {
  return {
    ok: false,
    reason,
    message,
    ...(extra ?? {}),
  } as { ok: false; reason: Reason; message: string } & Extra;
}

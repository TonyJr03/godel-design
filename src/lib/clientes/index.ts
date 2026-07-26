export {
  CLIENTE_FIELDS,
  validateClienteInput,
  type ClienteField,
  type ClienteFieldErrors,
  type CreateClienteData,
  type CreateClienteInput,
  type ValidateClienteInputResult,
} from "./client-validation";
export {
  createInternalCliente,
  type CreateInternalClienteErrorReason,
  type CreateInternalClienteResult,
} from "./create-internal-cliente";
export {
  getInternalClienteById,
  type GetInternalClienteByIdErrorReason,
  type GetInternalClienteByIdResult,
} from "./get-internal-cliente-by-id";
export {
  updateInternalCliente,
  type UpdateInternalClienteErrorReason,
  type UpdateInternalClienteInput,
  type UpdateInternalClienteResult,
} from "./update-internal-cliente";
export {
  listInternalClientes,
  type ListInternalClientesErrorReason,
  type ListInternalClientesOptions,
  type ListInternalClientesResult,
} from "./list-internal-clientes";
export {
  searchClientesForSelector,
  type ClienteSelectorOption,
  type SearchClientesForSelectorErrorReason,
  type SearchClientesForSelectorOptions,
  type SearchClientesForSelectorResult,
} from "./search-clientes-for-selector";
export type { InternalCliente, InternalClienteDetail } from "./types";

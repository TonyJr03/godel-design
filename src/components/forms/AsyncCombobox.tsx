"use client";

import { LoaderCircle } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

export type AsyncComboboxOption = {
  value: string;
  label: string;
  description?: string;
};

export type AsyncComboboxListboxPlacement = "bottom" | "top";

export type AsyncComboboxProps = {
  id: string;
  name: string;
  defaultOption?: AsyncComboboxOption | null;
  placeholder: string;
  searchPlaceholder?: string;
  emptyMessage: string;
  minimumQueryLength?: number;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  ariaDescribedBy?: string;
  allowClear?: boolean;
  clearLabel?: string;
  listboxPlacement?: AsyncComboboxListboxPlacement;
  loadOptions: (
    query: string,
    signal: AbortSignal,
  ) => Promise<AsyncComboboxOption[]>;
  onValueChange?: (option: AsyncComboboxOption | null) => void;
};

type DisplayOption = {
  option: AsyncComboboxOption | null;
  label: string;
  description?: string;
};

const DEBOUNCE_MS = 250;
const DEFAULT_MINIMUM_QUERY_LENGTH = 2;
const DEFAULT_CLEAR_LABEL = "Limpiar seleccion";
const REQUIRED_SELECTION_MESSAGE = "Selecciona una opcion de la lista.";

function getOptionLabel(option: AsyncComboboxOption | null | undefined) {
  return option?.label ?? "";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "No se pudieron cargar las opciones. Intentalo nuevamente.";
}

export function AsyncCombobox({
  id,
  name,
  defaultOption = null,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  minimumQueryLength = DEFAULT_MINIMUM_QUERY_LENGTH,
  disabled = false,
  required = false,
  invalid = false,
  ariaDescribedBy,
  allowClear = false,
  clearLabel = DEFAULT_CLEAR_LABEL,
  listboxPlacement = "bottom",
  loadOptions,
  onValueChange,
}: AsyncComboboxProps) {
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const statusId = `${reactId}-status`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const lastLoadedQueryRef = useRef<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelectedOption] =
    useState<AsyncComboboxOption | null>(defaultOption);
  const [inputValue, setInputValue] = useState(getOptionLabel(defaultOption));
  const [options, setOptions] = useState<AsyncComboboxOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmedQuery = inputValue.trim();
  const queryIsTooShort =
    trimmedQuery.length > 0 && trimmedQuery.length < minimumQueryLength;
  const shouldShowClearOption =
    allowClear && (trimmedQuery === "" || selectedOption !== null);
  const describedBy = [ariaDescribedBy, statusId].filter(Boolean).join(" ");

  const displayOptions = useMemo<DisplayOption[]>(() => {
    const clearOption = shouldShowClearOption
      ? [
          {
            option: null,
            label: clearLabel,
            description: undefined,
          },
        ]
      : [];

    return [
      ...clearOption,
      ...options.map((option) => ({
        option,
        label: option.label,
        description: option.description,
      })),
    ];
  }, [clearLabel, options, shouldShowClearOption]);

  const hasListbox = !errorMessage || options.length > 0;
  const activeDescendant =
    isOpen &&
    hasListbox &&
    activeIndex >= 0 &&
    activeIndex < displayOptions.length
      ? `${listboxId}-option-${activeIndex}`
      : undefined;

  const liveMessage = useMemo(() => {
    if (disabled) {
      return "Selector deshabilitado.";
    }

    if (isLoading) {
      return "Cargando opciones.";
    }

    if (errorMessage) {
      return errorMessage;
    }

    if (queryIsTooShort) {
      return `Escribe al menos ${minimumQueryLength} caracteres.`;
    }

    if (!isOpen) {
      return selectedOption ? `${selectedOption.label} seleccionado.` : "";
    }

    if (options.length === 0) {
      return emptyMessage;
    }

    const resultCount = options.length;

    return resultCount === 1
      ? "1 opcion encontrada."
      : `${resultCount} opciones encontradas.`;
  }, [
    disabled,
    emptyMessage,
    errorMessage,
    isLoading,
    isOpen,
    minimumQueryLength,
    options.length,
    queryIsTooShort,
    selectedOption,
  ]);

  const cancelCurrentRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const loadOptionsForQuery = useCallback(
    async (query: string) => {
      cancelCurrentRequest();
      const controller = new AbortController();
      const requestId = requestIdRef.current + 1;

      requestIdRef.current = requestId;
      abortControllerRef.current = controller;
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const nextOptions = await loadOptions(query, controller.signal);

        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }

        lastLoadedQueryRef.current = query;
        setOptions(nextOptions);
        const nextLength =
          (shouldShowClearOption ? 1 : 0) + nextOptions.length;
        setActiveIndex(nextLength > 0 ? 0 : -1);
      } catch (error) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }

        setErrorMessage(getErrorMessage(error));
      } finally {
        if (!controller.signal.aborted && requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [cancelCurrentRequest, loadOptions, shouldShowClearOption],
  );

  const resetToDefault = useCallback(() => {
    cancelCurrentRequest();
    requestIdRef.current += 1;
    lastLoadedQueryRef.current = null;
    setSelectedOption(defaultOption);
    setInputValue(getOptionLabel(defaultOption));
    setOptions([]);
    setErrorMessage(null);
    setIsLoading(false);
    setIsOpen(false);
    setActiveIndex(-1);
  }, [cancelCurrentRequest, defaultOption]);

  useEffect(() => {
    return () => {
      cancelCurrentRequest();
    };
  }, [cancelCurrentRequest]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(
      required && !disabled && selectedOption === null
        ? REQUIRED_SELECTION_MESSAGE
        : "",
    );
  }, [disabled, required, selectedOption]);

  useEffect(() => {
    const input = inputRef.current;
    const form = input?.form;

    if (!form) {
      return;
    }

    form.addEventListener("reset", resetToDefault);

    return () => {
      form.removeEventListener("reset", resetToDefault);
    };
  }, [resetToDefault]);

  useEffect(() => {
    if (!isOpen || disabled) {
      return;
    }

    if (queryIsTooShort) {
      cancelCurrentRequest();
      requestIdRef.current += 1;
      return;
    }

    const query = trimmedQuery;

    if (query === "" && lastLoadedQueryRef.current === "") {
      return;
    }

    const delay = query === "" ? 0 : DEBOUNCE_MS;
    const timerId = window.setTimeout(() => {
      void loadOptionsForQuery(query);
    }, delay);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    allowClear,
    cancelCurrentRequest,
    disabled,
    isOpen,
    loadOptionsForQuery,
    queryIsTooShort,
    trimmedQuery,
  ]);

  function openCombobox() {
    if (disabled) {
      return;
    }

    setIsOpen(true);
  }

  function closeCombobox() {
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function selectOption(option: AsyncComboboxOption | null) {
    setSelectedOption(option);
    setInputValue(getOptionLabel(option));
    setErrorMessage(null);
    closeCombobox();
    onValueChange?.(option);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    const nextTrimmedQuery = nextValue.trim();
    const nextSelectedOption =
      selectedOption && nextValue !== selectedOption.label
        ? null
        : selectedOption;
    const nextShouldShowClearOption =
      allowClear && (nextTrimmedQuery === "" || nextSelectedOption !== null);

    cancelCurrentRequest();
    requestIdRef.current += 1;
    setIsLoading(false);
    setErrorMessage(null);

    if (selectedOption && nextValue !== selectedOption.label) {
      setSelectedOption(null);
      onValueChange?.(null);
    }

    setInputValue(nextValue);
    if (
      nextTrimmedQuery.length > 0 &&
      nextTrimmedQuery.length < minimumQueryLength
    ) {
      setOptions([]);
      setActiveIndex(nextShouldShowClearOption ? 0 : -1);
    }

    setIsOpen(true);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;

    if (
      nextTarget instanceof Node &&
      event.currentTarget.contains(nextTarget)
    ) {
      return;
    }

    closeCombobox();
  }

  function moveActiveOption(nextIndex: number) {
    if (displayOptions.length === 0) {
      setActiveIndex(-1);
      return;
    }

    const boundedIndex =
      ((nextIndex % displayOptions.length) + displayOptions.length) %
      displayOptions.length;

    setActiveIndex(boundedIndex);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      openCombobox();
      moveActiveOption(activeIndex < 0 ? 0 : activeIndex + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      openCombobox();
      moveActiveOption(
        activeIndex < 0 ? displayOptions.length - 1 : activeIndex - 1,
      );
      return;
    }

    if (event.key === "Enter" && isOpen) {
      if (activeIndex >= 0 && activeIndex < displayOptions.length) {
        event.preventDefault();
        selectOption(displayOptions[activeIndex].option);
      }

      return;
    }

    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeCombobox();
      return;
    }

    if (event.key === "Home" && isOpen && displayOptions.length > 0) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End" && isOpen && displayOptions.length > 0) {
      event.preventDefault();
      setActiveIndex(displayOptions.length - 1);
    }
  }

  function handleOptionMouseDown(event: MouseEvent) {
    event.preventDefault();
  }

  const showListbox = isOpen && !disabled;
  const optionItems =
    displayOptions.length > 0
      ? displayOptions.map((displayOption, index) => {
        const isSelected =
          displayOption.option === null
            ? inputValue.trim() === "" &&
              selectedOption === null &&
              shouldShowClearOption
            : selectedOption?.value === displayOption.option.value;
        const isActive = activeIndex === index;

        return (
          <li
            key={displayOption.option?.value ?? "__clear__"}
            id={`${listboxId}-option-${index}`}
            role="option"
            aria-selected={isSelected}
            onMouseDown={handleOptionMouseDown}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => selectOption(displayOption.option)}
            className={[
              "cursor-pointer px-3 py-2 text-sm transition-colors duration-150",
              isActive
                ? "bg-brand-primary-soft text-brand-primary"
                : "text-text-primary hover:bg-surface-muted",
              isSelected ? "font-semibold" : undefined,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="block truncate">{displayOption.label}</span>
            {displayOption.description ? (
              <span className="mt-0.5 block truncate text-xs font-normal text-text-secondary">
                {displayOption.description}
              </span>
            ) : null}
          </li>
        );
      })
      : null;
  const listboxContent = (
    <>
      {optionItems}
      {queryIsTooShort ? (
        <li className="px-3 py-3 text-sm text-text-secondary">
          Escribe al menos {minimumQueryLength} caracteres.
        </li>
      ) : null}
      {!queryIsTooShort && !isLoading && options.length === 0 ? (
        <li className="px-3 py-3 text-sm text-text-secondary">
          {emptyMessage}
        </li>
      ) : null}
    </>
  );
  const listboxPanel = showListbox ? (
    <div
      className={[
        "min-w-0 overflow-hidden rounded-(--radius-card) border border-border bg-surface shadow-(--shadow-soft)",
        listboxPlacement === "top"
          ? "absolute inset-x-0 bottom-[calc(100%+0.375rem)] z-20"
          : "mt-1.5",
      ].join(" ")}
    >
      {errorMessage ? (
        <div
          aria-busy={isLoading || undefined}
          className={[
            "space-y-2 px-3 py-3 text-sm",
            options.length > 0 ? "border-b border-border" : undefined,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <p className="text-danger">{errorMessage}</p>
          <button
            type="button"
            onMouseDown={handleOptionMouseDown}
            onClick={() => void loadOptionsForQuery(trimmedQuery)}
            className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm font-semibold text-brand-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Reintentar
          </button>
        </div>
      ) : null}
      {hasListbox ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-busy={isLoading || undefined}
          className={[
            "max-h-60 min-w-0 overflow-y-auto overflow-x-hidden py-1",
            isLoading && displayOptions.length === 0 ? "min-h-12" : undefined,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {listboxContent}
        </ul>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      className={
        listboxPlacement === "top" ? "relative min-w-0 w-full" : "min-w-0 w-full"
      }
      onBlur={handleBlur}
    >
      <input
        type="hidden"
        name={name}
        value={selectedOption?.value ?? ""}
        disabled={disabled}
      />

      <div className="relative min-w-0">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          value={inputValue}
          disabled={disabled}
          required={required}
          placeholder={searchPlaceholder ?? placeholder}
          autoComplete="off"
          aria-expanded={showListbox}
          aria-controls={showListbox && hasListbox ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeDescendant}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy || undefined}
          aria-required={required || undefined}
          onChange={handleInputChange}
          onFocus={openCombobox}
          onMouseDown={openCombobox}
          onInvalid={(event) => {
            setIsOpen(true);
            event.currentTarget.focus();
          }}
          onKeyDown={handleKeyDown}
          className={[
            "min-h-11 w-full rounded-(--radius-control) border bg-surface px-3 py-2 pr-10 text-base text-text-primary shadow-(--shadow-soft) transition-[border-color,box-shadow,background-color] placeholder:text-text-muted hover:border-brand-primary focus:border-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted disabled:opacity-70",
            invalid ? "border-danger" : "border-border-strong",
          ].join(" ")}
        />
        {isLoading ? (
          <div className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center">
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin text-text-muted"
            />
          </div>
        ) : null}
      </div>

      {listboxPanel}

      <p id={statusId} className="sr-only" aria-live="polite">
        {liveMessage}
      </p>
    </div>
  );
}

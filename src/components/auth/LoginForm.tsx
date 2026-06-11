"use client";

import { useActionState } from "react";
import { login, type LoginActionState } from "@/app/login/actions";
import { Alert, Button, Card, FormField, Input } from "@/components/ui";

const initialState: LoginActionState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <Card
      as="section"
      variant="raised"
      padding="lg"
      className="w-full"
      aria-labelledby="login-form-heading"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-accent">
          Área privada
        </p>
        <h2
          id="login-form-heading"
          className="mt-2 text-2xl font-semibold tracking-tight text-text-primary"
        >
          Iniciar sesión
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Ingresa con las credenciales internas asignadas a tu perfil.
        </p>
      </div>

      <form
        action={formAction}
        aria-busy={pending}
        aria-describedby={state.message ? "login-error" : undefined}
        className="mt-6"
      >
        <div className="space-y-5">
          <FormField
            id="email"
            label="Correo"
            required
            optional={false}
          >
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="correo@godeldiseno.com"
            />
          </FormField>

          <FormField
            id="password"
            label="Contraseña"
            required
            optional={false}
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Tu contraseña"
            />
          </FormField>
        </div>

        {state.message ? (
          <Alert
            id="login-error"
            variant="danger"
            title="No se pudo iniciar sesión"
            aria-live="polite"
            className="mt-5"
          >
            {state.message}
          </Alert>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="mt-6 w-full"
        >
          {pending ? "Validando acceso..." : "Entrar al workspace"}
        </Button>
      </form>
    </Card>
  );
}

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import {
  DASHBOARD_NOT_FOUND_FALLBACK_PATH,
  canAccessDashboardRoute,
  isKnownDashboardRoute,
} from "@/lib/permissions";
import {
  getSupabasePublishableKey,
  getSupabaseServerUrl,
} from "@/lib/supabase/server-config";
import type { Database } from "@/types/database";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

const protectedPathPrefix = "/dashboard";
const loginPath = "/login";
const initialPasswordChangePath = "/cambiar-contrasena-inicial";
const deniedPath = "/acceso-denegado";
const noPermissionsPath = "/sin-permisos";

function applySessionCookies(
  response: NextResponse,
  cookiesToSet: CookieToSet[],
  headersToSet: Record<string, string>,
) {
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  Object.entries(headersToSet).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  let cookiesToSet: CookieToSet[] = [];
  let headersToSet: Record<string, string> = {};

  const supabase = createServerClient<Database>(
    getSupabaseServerUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(newCookies, newHeaders) {
          cookiesToSet = [...cookiesToSet, ...newCookies];
          headersToSet = { ...headersToSet, ...newHeaders };

          newCookies.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({ request });
          applySessionCookies(response, cookiesToSet, headersToSet);
        },
      },
    },
  );

  const pathname = request.nextUrl.pathname;
  const isDashboardRoute =
    pathname === protectedPathPrefix ||
    pathname.startsWith(`${protectedPathPrefix}/`);
  const isLoginRoute = pathname === loginPath;
  const isInitialPasswordChangeRoute = pathname === initialPasswordChangePath;
  const isDeniedRoute = pathname === deniedPath;
  const isNoPermissionsRoute = pathname === noPermissionsPath;

  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  const isAuthenticated = Boolean(userId && !error);
  const authenticatedUserId = isAuthenticated ? userId : null;

  if (isDeniedRoute || isNoPermissionsRoute) {
    return response;
  }

  if ((isDashboardRoute || isInitialPasswordChangeRoute) && !isAuthenticated) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = loginPath;
    redirectUrl.search = "";

    return applySessionCookies(
      NextResponse.redirect(redirectUrl),
      cookiesToSet,
      headersToSet,
    );
  }

  if (
    (isDashboardRoute || isLoginRoute || isInitialPasswordChangeRoute) &&
    authenticatedUserId
  ) {
    const { data: profile, error: profileError } = await supabase
      .from("perfiles")
      .select("id, role, is_active, must_change_password")
      .eq("id", authenticatedUserId)
      .maybeSingle();

    if (profileError || !profile?.is_active) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = deniedPath;
      redirectUrl.search = "";

      return applySessionCookies(
        NextResponse.redirect(redirectUrl),
        cookiesToSet,
        headersToSet,
      );
    }

    const activeProfile = profile;

    if (activeProfile.must_change_password === true) {
      if (isInitialPasswordChangeRoute) {
        return response;
      }

      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = initialPasswordChangePath;
      redirectUrl.search = "";

      return applySessionCookies(
        NextResponse.redirect(redirectUrl),
        cookiesToSet,
        headersToSet,
      );
    }

    if (isInitialPasswordChangeRoute) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = protectedPathPrefix;
      redirectUrl.search = "";

      return applySessionCookies(
        NextResponse.redirect(redirectUrl),
        cookiesToSet,
        headersToSet,
      );
    }

    if (isDashboardRoute && !isKnownDashboardRoute(pathname)) {
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = DASHBOARD_NOT_FOUND_FALLBACK_PATH;
      rewriteUrl.search = "";

      return applySessionCookies(
        NextResponse.rewrite(rewriteUrl),
        cookiesToSet,
        headersToSet,
      );
    }

    if (
      isDashboardRoute &&
      !canAccessDashboardRoute(activeProfile.role, pathname)
    ) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = noPermissionsPath;
      redirectUrl.search = "";

      return applySessionCookies(
        NextResponse.redirect(redirectUrl),
        cookiesToSet,
        headersToSet,
      );
    }
  }

  if (isLoginRoute && isAuthenticated) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = protectedPathPrefix;
    redirectUrl.search = "";

    return applySessionCookies(
      NextResponse.redirect(redirectUrl),
      cookiesToSet,
      headersToSet,
    );
  }

  return response;
}

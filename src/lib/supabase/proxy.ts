import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/database";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

const protectedPathPrefix = "/dashboard";
const loginPath = "/login";

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
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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

  const { data, error } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims.sub && !error);
  const pathname = request.nextUrl.pathname;
  const isDashboardRoute = pathname.startsWith(protectedPathPrefix);

  if (isDashboardRoute && !isAuthenticated) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = loginPath;
    redirectUrl.search = "";

    return applySessionCookies(
      NextResponse.redirect(redirectUrl),
      cookiesToSet,
      headersToSet,
    );
  }

  if (pathname === loginPath && isAuthenticated) {
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

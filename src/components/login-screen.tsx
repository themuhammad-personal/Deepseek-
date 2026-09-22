import { useEffect, useState } from "react";
import { LogoMark } from "./logo-mark";
import { useAppStore } from "@/lib/app-store";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/types";
import { dsLoginDirect } from "@/lib/deepseek/client-direct";

type Tab = "email" | "phone";

export function LoginScreen() {
  const locale = useAppStore((s) => s.settings.locale);
  const busy = useAppStore((s) => s.ui.loginBusy);
  const error = useAppStore((s) => s.ui.loginError);
  const [tab, setTab] = useState<Tab>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("+880");
  const [password, setPassword] = useState("");
  const [wafStatus, setWafStatus] = useState("");

  useEffect(() => {
    const checkBridge = () => {
      const bridge = (window as any).AndroidBridge;
      if (bridge?.dsLoginNative) {
        setWafStatus("Native bridge ready - WAF cookies solving in background...");
        setTimeout(() => setWafStatus(""), 5000);
      } else {
        setWafStatus("Initializing secure connection...");
        setTimeout(() => setWafStatus(""), 3000);
      }
    };
    checkBridge();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const store = useAppStore.getState();
    store.setLoginError("");
    store.setLoginBusy(true);
    setWafStatus("Connecting to DeepSeek...");
    try {
      let token: string | undefined
      let retEmail: string | undefined
      let retMobile: string | undefined

      try {
        const res = await fetch("/api/ds/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            tab === "email"
              ? { email: email.trim(), password }
              : { mobile: phone.trim(), area_code: area, password },
          ),
        });
        const json = (await res.json()) as {
          token?: string;
          email?: string;
          mobile?: string;
          error?: string;
        };
        if (res.ok && json.token) {
          token = json.token
          retEmail = json.email
          retMobile = json.mobile
        } else {
          throw new Error(json.error || "Login failed")
        }
      } catch (err) {
        console.log("[Login] Server API failed, trying official DeepSeek via native bridge:", err)
        setWafStatus("Trying official DeepSeek login via hidden WebView (bypass WAF)...")
        try {
          const direct = await dsLoginDirect(
            tab === "email"
              ? { email: email.trim(), password }
              : { mobile: phone.trim(), area_code: area, password }
          );
          token = direct.token
          retEmail = direct.email
          retMobile = direct.mobile
          setWafStatus("Login success via official API!")
        } catch (directErr) {
          const msg = directErr instanceof Error ? directErr.message : "Sign in failed"
          console.error("[Login] Direct login failed:", msg)
          if (msg.includes("WAF") || msg.includes("wait") || msg.includes("challenge")) {
            setWafStatus("WAF challenge solving... Please wait 5 sec and retry")
          }
          store.setLoginError(msg)
          return
        }
      }

      if (!token) {
        store.setLoginError(t(locale, "loginFailed"));
        return;
      }
      store.setAccount({
        token,
        email: retEmail || email.trim(),
        mobile: retMobile || phone.trim(),
      });
      setWafStatus("Signed in! Loading workspace...")
    } catch {
      store.setLoginError(t(locale, "loginFailed"));
    } finally {
      store.setLoginBusy(false);
      setTimeout(() => setWafStatus(""), 3000)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg px-6 text-fg">
      <div className="flex justify-end pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex rounded-[var(--radius-sm)] bg-elevated p-1 shadow-[var(--shadow-border)]">
          {(["en", "bn"] as Locale[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => useAppStore.getState().setLocale(id)}
              className={cn(
                "h-8 rounded-[6px] px-3 text-xs font-medium",
                locale === id ? "bg-surface text-fg" : "text-muted",
              )}
            >
              {id === "en" ? "EN" : "বাংলা"}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="size-16" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">{t(locale, "appName")}</h1>
          <p className="mt-2 text-sm text-muted">{t(locale, "loginTagline")}</p>
        </div>

        <div className="mb-5 flex rounded-[var(--radius-sm)] bg-elevated p-1 shadow-[var(--shadow-border)]">
          {(["email", "phone"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "h-9 flex-1 rounded-[6px] text-sm font-medium",
                tab === id ? "bg-surface text-fg" : "text-muted",
              )}
            >
              {t(locale, id === "email" ? "email" : "phone")}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {tab === "email" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">{t(locale, "email")}</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
                className="h-11 w-full rounded-[var(--radius-md)] bg-surface px-4 text-sm shadow-[var(--shadow-border)] outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
                required
              />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted">{t(locale, "areaCode")}</label>
                <input
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="h-11 w-full rounded-[var(--radius-md)] bg-surface px-4 text-sm shadow-[var(--shadow-border)] outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted">{t(locale, "phone")}</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="1XXXXXXXXX"
                  inputMode="numeric"
                  className="h-11 w-full rounded-[var(--radius-md)] bg-surface px-4 text-sm shadow-[var(--shadow-border)] outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
                  required
                />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted">{t(locale, "password")}</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              className="h-11 w-full rounded-[var(--radius-md)] bg-surface px-4 text-sm shadow-[var(--shadow-border)] outline-none focus:ring-2 focus:ring-accent"
              required
            />
          </div>

          {wafStatus ? (
            <p className="rounded-[var(--radius-sm)] bg-accent/10 px-3 py-2 text-xs text-accent animate-pulse">{wafStatus}</p>
          ) : null}

          {error ? (
            <p className="rounded-[var(--radius-sm)] bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="flex h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-accent px-4 text-sm font-medium text-white shadow-[var(--shadow-border)] disabled:opacity-60"
          >
            {busy ? t(locale, "signingIn") : t(locale, "continueWithDeepSeek")}
          </button>

          <p className="pt-2 text-center text-[11px] leading-4 text-faint">
            {t(locale, "loginFooter")} • Official login via hidden WebView (bypass WAF)
          </p>
        </form>
      </div>
    </div>
  );
}

import classNames from "classnames";
import { Button } from "@material-tailwind/react";
import AuthenticateWithTwitch from "./AuthenticateWithTwitch";
import AppContainer from "./AppContainer";
import {
  AUTHENTICATION_MESSAGES,
  useTwitchAuthentication,
} from "@/lib/twitchAuthentication";
import { debugLogger } from "@/lib/debugLogger";

function MainContainer() {
  debugLogger("MainContainer");
  const authentication = useTwitchAuthentication();
  let container: React.ReactNode;

  switch (authentication.state.status) {
    case "checking":
      container = (
        <p className="mt-8 text-sm dark:text-white" role="status">
          Checking Twitch authentication…
        </p>
      );
      break;
    case "authenticated":
      container = (
        <AppContainer
          key={authentication.state.credentials.userId}
          accessToken={authentication.state.credentials.accessToken}
          twitchUserId={authentication.state.credentials.userId}
          onAuthenticationInvalid={authentication.invalidate}
        />
      );
      break;
    case "unauthenticated":
      container = (
        <>
          {authentication.state.reason !== "missing_token" && (
            <p
              className="mt-8 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
              role="alert"
            >
              {AUTHENTICATION_MESSAGES[authentication.state.reason]}
            </p>
          )}
          <AuthenticateWithTwitch />
        </>
      );
      break;
    case "error":
      container = (
        <div
          className="mt-8 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
          role="alert"
          aria-atomic="true"
        >
          <p>{AUTHENTICATION_MESSAGES[authentication.state.code]}</p>
          {authentication.state.code === "rate_limited" &&
            authentication.state.retryAt !== null && (
              <p id="authentication-retry-time" className="mt-2">
                Retry available after: {" "}
                {new Date(authentication.state.retryAt).toLocaleTimeString()}
              </p>
            )}
          <Button
            className="mt-3 dark:text-white"
            size="sm"
            onClick={authentication.retry}
            disabled={!authentication.canRetry}
            aria-describedby={
              authentication.state.code === "rate_limited" &&
              authentication.state.retryAt !== null
                ? "authentication-retry-time"
                : undefined
            }
          >
            Retry authentication check
          </Button>
        </div>
      );
      break;
  }

  return (
    <main>
      <div
        className={classNames(
          "container",
          "mx-auto",
          "nx-pl-[max(env(safe-area-inset-left),1.5rem)]",
          "nx-pr-[max(env(safe-area-inset-right),1.5rem)]"
        )}
      >
        {container}
      </div>
    </main>
  );
}

export default MainContainer;

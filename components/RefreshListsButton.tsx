import { useEffect, useRef, useState } from "react";
import { Button } from "@material-tailwind/react";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import classNames from "classnames";
import { debugLogger } from "@/lib/debugLogger";

const REFRESH_COOLDOWN_SECONDS = 90;
const REFRESH_COOLDOWN_MS = REFRESH_COOLDOWN_SECONDS * 1000;

export type RefreshListsButtonProps = {
  /** True while the owner is fetching and validating a complete snapshot. */
  isRefreshing: boolean;
  /** Unix epoch in milliseconds until which refresh must remain unavailable. */
  retryAt?: number | null;
  /** Resolves to true only when a complete refresh was committed. */
  onRefresh: () => Promise<boolean>;
};

const RefreshListsButton: React.FC<RefreshListsButtonProps> = ({
  isRefreshing,
  retryAt,
  onRefresh,
}) => {
  const [isRequestPending, setIsRequestPending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const requestInFlightRef = useRef(false);
  const mountedRef = useRef(false);

  debugLogger("RefreshListsButton");

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const normalizedRetryAt =
      typeof retryAt === "number" && Number.isFinite(retryAt) ? retryAt : 0;
    const endTime = Math.max(cooldownUntil, normalizedRetryAt);
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const updateTimeRemaining = () => {
      const nextTimeRemaining = Math.max(
        0,
        Math.ceil((endTime - Date.now()) / 1000)
      );

      if (mountedRef.current) {
        setTimeRemaining((previousTimeRemaining) =>
          previousTimeRemaining === nextTimeRemaining
            ? previousTimeRemaining
            : nextTimeRemaining
        );
      }

      if (nextTimeRemaining === 0 && intervalId !== undefined) {
        clearInterval(intervalId);
      }
    };

    updateTimeRemaining();
    if (endTime > Date.now()) {
      intervalId = setInterval(updateTimeRemaining, 1000);
    }

    return () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
      }
    };
  }, [cooldownUntil, retryAt]);

  const normalizedRetryAt =
    typeof retryAt === "number" && Number.isFinite(retryAt) ? retryAt : 0;
  const cooldownEnd = Math.max(cooldownUntil, normalizedRetryAt);
  const isCooldownActive = cooldownEnd > Date.now() || timeRemaining > 0;
  const isButtonDisabled =
    isRefreshing || isRequestPending || isCooldownActive;

  const handleClick = () => {
    // The ref closes the small event-loop window before React has applied the
    // disabled state, so a rapid double click cannot start two requests.
    if (requestInFlightRef.current || isButtonDisabled) {
      return;
    }

    requestInFlightRef.current = true;
    setIsRequestPending(true);

    let refreshPromise: Promise<boolean>;
    try {
      refreshPromise = onRefresh();
    } catch {
      requestInFlightRef.current = false;
      if (mountedRef.current) {
        setIsRequestPending(false);
      }
      return;
    }

    Promise.resolve(refreshPromise).then(
      (succeeded) => {
        requestInFlightRef.current = false;
        if (!mountedRef.current) {
          return;
        }

        setIsRequestPending(false);
        if (succeeded === true) {
          // The cooldown starts only after the owner confirms that the
          // complete snapshot was accepted. Failed or partial refreshes can
          // therefore be retried immediately (unless retryAt says otherwise).
          setCooldownUntil(Date.now() + REFRESH_COOLDOWN_MS);
        }
      },
      () => {
        requestInFlightRef.current = false;
        if (mountedRef.current) {
          setIsRequestPending(false);
        }
      }
    );
  };

  const formatTime = (timeInSeconds: number) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = timeInSeconds % 60;
    return `Refresh available in: ${minutes}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-wrap items-center">
      <Button
        className={classNames(
          "flex",
          "items-center",
          "gap-1",
          "dark:text-white",
          "mb-8",
          "sm:mb-4"
        )}
        size="sm"
        onClick={handleClick}
        disabled={isButtonDisabled}
        aria-busy={isRefreshing || isRequestPending}
        aria-label={
          isRefreshing || isRequestPending
            ? "Refreshing follower lists"
            : "Refresh follower lists"
        }
        aria-describedby={
          timeRemaining > 0 ? "refresh-cooldown-status" : undefined
        }
      >
        <AutorenewIcon
          className="!text-sm sm:!text-2xl"
          aria-hidden="true"
        />
        Refresh Lists
      </Button>
      {timeRemaining > 0 && (
        <span
          id="refresh-cooldown-status"
          className="ml-4 !text-sm sm:!text-base"
          aria-live="off"
        >
          {formatTime(timeRemaining)}
        </span>
      )}
    </div>
  );
};

export default RefreshListsButton;

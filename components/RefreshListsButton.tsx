import { useState, useEffect, useCallback } from "react";
import { Button } from "@material-tailwind/react";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import classNames from "classnames";

const RefreshListsButton: React.FC<{ onRefresh: () => void }> = ({
  onRefresh,
}) => {
  const [isDisabled, setIsDisabled] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [worker, setWorker] = useState<Worker | null>(null);

  useEffect(() => {
    return () => {
      if (worker) {
        worker.terminate();
      }
    };
  }, [worker]);

  const startCountdownWithWorker = useCallback((duration: number) => {
    const countdownWorker = new Worker(
      new URL("@/lib/countdownWorker.ts", import.meta.url)
    );
    countdownWorker.postMessage(duration);
    countdownWorker.onmessage = (e) => {
      if (e.data <= 0) {
        setIsDisabled(false);
        setWorker(null);
      }
      setTimeRemaining(e.data);
    };
  }, []);

  const startCountdownOnMainThread = useCallback((duration: number) => {
    const intervalId = setInterval(() => {
      setTimeRemaining((prevTime) => {
        prevTime -= 1;
        if (prevTime <= 0) {
          clearInterval(intervalId);
          setIsDisabled(false);
        }
        return prevTime;
      });
    }, 1000);
  }, []);

  const startCountdown = useCallback(
    (duration: number) => {
      setTimeRemaining(duration);
      if (!window.Worker) {
        startCountdownWithWorker(duration);
      } else {
        startCountdownOnMainThread(duration);
      }
    },
    [startCountdownWithWorker, startCountdownOnMainThread]
  );

  const handleClick = () => {
    setIsDisabled(true);
    onRefresh();
    startCountdown(90); // 1.5 min
  };

  const formatTime = (timeInSeconds: number) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = timeInSeconds % 60;
    return `Refresh available in: ${minutes}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center">
      <Button
        className={classNames(
          "flex",
          "items-center",
          "gap-1",
          "dark:text-white",
          "mb-4"
        )}
        size="sm"
        onClick={handleClick}
        disabled={isDisabled}
      >
        <AutorenewIcon />
        Refresh Lists
      </Button>
      {timeRemaining > 0 && (
        <span className="ml-4">{formatTime(timeRemaining)}</span>
      )}
    </div>
  );
};

export default RefreshListsButton;

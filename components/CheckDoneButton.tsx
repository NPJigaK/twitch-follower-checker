import { debugLogger } from "@/lib/debugLogger";
import { Button } from "@material-tailwind/react";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import classNames from "classnames";

const CheckDoneButton: React.FC<{
  onChecked: () => void;
  isDisabled: boolean;
}> = ({ onChecked, isDisabled }) => {
  const handleClick = () => {
    onChecked();
  };

  debugLogger("CheckDoneButton");
  return (
    <Button
      className={classNames(
        "flex",
        "items-center",
        "gap-1",
        "dark:text-white",
        "min-w-fit" // min-width: fit-content;
      )}
      size="sm"
      onClick={handleClick}
      disabled={isDisabled}
    >
      <CheckCircleIcon className="!text-sm sm:!text-2xl" />
      Check done
    </Button>
  );
};

export default CheckDoneButton;
